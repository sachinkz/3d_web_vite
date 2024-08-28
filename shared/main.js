/**
 * Query for WebXR support. If there's no support for the `immersive-ar` mode,
 * show an error.
 */
(async function () {
  const isArSessionSupported =
    navigator.xr &&
    navigator.xr.isSessionSupported &&
    await navigator.xr.isSessionSupported("immersive-ar");
  if (isArSessionSupported) {
    document.getElementById("enter-ar").addEventListener("click", window.app.activateXR);
  } else {
    onNoXRDevice();
  }
})();

class App {
  constructor() {
    this.captureButton = document.getElementById("capture-button");
    this.captureContainer = document.getElementById("capture-container");
    this.captureButton.addEventListener("click", this.captureImage);

    // Initialize the flag to track cloning status
    this.modelCloned = false;
    this.animation = false;
  }

  activateXR = async () => {
    try {
      // Initialize a WebXR session using "immersive-ar".
      this.xrSession = await navigator.xr.requestSession("immersive-ar", {
        requiredFeatures: ['hit-test', 'dom-overlay'],
        domOverlay: { root: document.body }
      });

      // Create the canvas that will contain our camera's background and our virtual scene.
      this.createXRCanvas();

      // With everything set up, start the app.
      await this.onSessionStarted();
    } catch (e) {
      console.log(e);
      onNoXRDevice();
    }
  }

  createXRCanvas() {
    this.canvas = document.createElement("canvas");
    this.canvas.id = "ar-canvas"
    document.body.appendChild(this.canvas);
    this.gl = this.canvas.getContext("webgl", { xrCompatible: true });

    this.xrSession.updateRenderState({
      baseLayer: new XRWebGLLayer(this.xrSession, this.gl)
    });
  }

  onSessionStarted = async () => {
    document.body.classList.add('ar');
    this.setupThreeJs();

    this.localReferenceSpace = await this.xrSession.requestReferenceSpace('local');
    this.viewerSpace = await this.xrSession.requestReferenceSpace('viewer');
    this.hitTestSource = await this.xrSession.requestHitTestSource({ space: this.viewerSpace });

    this.xrSession.requestAnimationFrame(this.onXRFrame);
    this.xrSession.addEventListener("select", this.onSelect);
  }

  onSelect = () => {
    if (!this.modelCloned && this.sunflower) {
      // Position the model at the reticle's location
      this.sunflower.position.copy(this.reticle.position);
      // Make the model visible
      this.sunflower.visible = true;
      // Show the capture container
      this.captureContainer.style.display = "flex";

      // Adjust the shadow mesh position
      const shadowMesh = this.scene.children.find(c => c.name === 'shadowMesh');
      if (shadowMesh) {
        shadowMesh.position.y = this.sunflower.position.y;
      } else {
        console.warn('Shadow mesh not found.');
      }

      // Mark the model as placed
      this.modelCloned = true;

      // Hide the reticle
      if (this.reticle) {
        this.reticle.hide();
      } else {
        console.warn('Reticle is not found.');
      }
    }
  }


  onXRFrame = (time, frame) => {
    this.xrSession.requestAnimationFrame(this.onXRFrame);

    const framebuffer = this.xrSession.renderState.baseLayer.framebuffer;
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, framebuffer);
    this.renderer.setFramebuffer(framebuffer);

    const pose = frame.getViewerPose(this.localReferenceSpace);
    if (pose) {
      const view = pose.views[0];
      const viewport = this.xrSession.renderState.baseLayer.getViewport(view);
      this.renderer.setSize(viewport.width, viewport.height);

      this.camera.matrix.fromArray(view.transform.matrix);
      this.camera.projectionMatrix.fromArray(view.projectionMatrix);
      this.camera.updateMatrixWorld(true);

      const hitTestResults = frame.getHitTestResults(this.hitTestSource);

      if (!this.stabilized && hitTestResults.length > 0) {
        this.stabilized = true;
        document.body.classList.add('stabilized');
      }
      if (hitTestResults.length > 0) {
        const hitPose = hitTestResults[0].getPose(this.localReferenceSpace);

        if (this.reticle && !this.modelCloned) {
          this.reticle.visible = true;
          this.reticle.position.set(hitPose.transform.position.x, hitPose.transform.position.y, hitPose.transform.position.z);
          this.reticle.updateMatrixWorld(true);
        } else {
          console.error('Reticle is not found.');
        }
      }

      if (this.mixer && this.animation) {
        // Get the time elapsed since the last frame and update the mixer
        this.mixer.update(this.animationClock.getDelta());
      }

      this.renderer.render(this.scene, this.camera);
    }
  }

  setupThreeJs() {
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      preserveDrawingBuffer: true,
      canvas: this.canvas,
      context: this.gl
    });
    this.renderer.autoClear = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = DemoUtils.createLitScene();
    this.reticle = new Reticle();
    this.scene.add(this.reticle);

    this.camera = new THREE.PerspectiveCamera();
    this.camera.matrixAutoUpdate = false;

    // Load the 3D model
    window.gltfLoader.load("../public/robot/scene.gltf", (gltf) => {
      // Find the main model in the loaded scene
      const model = gltf.scene.children.find(c => c.name === 'Sketchfab_model')
      model.castShadow = true;
      model.scale.set(0.09, 0.09, 0.09);
      this.sunflower = gltf.scene;

      // Create an animation mixer for this model
      this.mixer = new THREE.AnimationMixer(model);

      // Get the animations from the loaded GLTF file
      const animations = gltf.animations;
      if (animations && animations.length > 0) {
        this.animation = true;
        // Create an animation action for the first animation
        const action = this.mixer.clipAction(animations[0]);
        // Start playing the animation
        action.play();
      }

      // Add the model to the scene, but hide it initially
      this.scene.add(this.sunflower);
      this.sunflower.visible = false;
    });

    // Create a clock for timing the animations
    this.animationClock = new THREE.Clock();
  }


  captureImage = async () => {
    const prompt = document.getElementById("prompt")
    prompt.style.display = "flex"
    console.log('Starting capture process');
    this.xrSession.requestAnimationFrame((time, frame) => {
      console.log('requestAnimationFrame called');

      // Get the pose in the reference space
      const pose = frame.getViewerPose(this.localReferenceSpace);

      if (pose) {
        const view = pose.views[0];
        const viewport = this.xrSession.renderState.baseLayer.getViewport(view);

        console.log('Pose obtained, rendering scene');

        // Set the renderer size to match the XR viewport
        this.renderer.setSize(viewport.width, viewport.height, false);

        // Render the scene
        this.renderer.render(this.scene, this.camera);

        console.log('Scene rendered, capturing pixels');

        // Get the WebGL context
        const gl = this.renderer.getContext();

        // Read pixels directly from the WebGL context
        const pixels = new Uint8Array(viewport.width * viewport.height * 4);
        gl.readPixels(0, 0, viewport.width, viewport.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

        console.log('Pixels captured, processing image');

        // Create a 2D canvas to flip the image vertically (WebGL reads bottom to top)
        const arCanvas = document.createElement('canvas');
        arCanvas.width = viewport.width;
        arCanvas.height = viewport.height;
        const arCtx = arCanvas.getContext('2d');

        // Flip the canvas to correct the image orientation
        arCtx.translate(0, arCanvas.height);
        arCtx.scale(1, -1);

        // Create an ImageData object and put it into the canvas
        const imageData = arCtx.createImageData(viewport.width, viewport.height);
        imageData.data.set(pixels);
        arCtx.putImageData(imageData, 0, 0);

        // Now, capture the camera feed
        this.getCamerafeed(arCanvas, viewport.width / viewport.height);
      } else {
        console.error('No pose available for capture');
      }
    });
  }

  getCamerafeed = (arCanvas, arAspectRatio) => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const video = document.getElementById('video');
      const cameraCanvas = document.createElement('canvas');
      const context = cameraCanvas.getContext('2d');

      // Set the target aspect ratio to 9:20
      const targetAspectRatio = 9 / 20;

      // Set the cameraCanvas height to match the AR canvas height
      cameraCanvas.height = arCanvas.height;

      // Calculate the required width based on the 9:20 aspect ratio
      const requiredWidth = cameraCanvas.height * targetAspectRatio;
      cameraCanvas.width = requiredWidth;

      // Request access to the camera
      navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: 'environment' } } })
        .then(stream => {
          // Set the video source to the stream
          video.srcObject = stream;
          video.play();

          video.onloadeddata = () => {
            // Calculate cropping parameters to center the video
            const cropWidth = video.videoHeight * targetAspectRatio;
            const cropX = (video.videoWidth - cropWidth) / 2;

            // Flip the camera feed vertically to match the AR canvas orientation
            context.translate(0, cameraCanvas.height);
            context.scale(1, -1);

            // Draw the cropped video frame to the canvas
            context.drawImage(video, cropX, 0, cropWidth, video.videoHeight, 0, 0, cameraCanvas.width, cameraCanvas.height);

            // Combine both canvases
            this.combineCanvases(arCanvas, cameraCanvas);
          };
        })
        .catch(error => {
          console.error('Error accessing media devices.', error);
          alert('Failed to access the camera. Please check your browser permissions.');
        });
    }
  }

  combineCanvases = (arCanvas, cameraCanvas) => {
    try {
      const finalCanvas = document.createElement('canvas');
      const ctx = finalCanvas.getContext('2d');

      // Calculate the new height for cropping the AR and camera feed canvases
      const targetHeight = Math.floor((3 / 4) * arCanvas.height);
      const cropMargin = Math.floor((arCanvas.height - targetHeight) / 2);

      // Load the banner image
      const bannerImage = new Image();
      bannerImage.src = 'public/banner.jpg'; // Path to your banner image

      bannerImage.onload = () => {
        // Calculate the final canvas height to include the banner on top
        finalCanvas.width = arCanvas.width;
        finalCanvas.height = targetHeight + bannerImage.height;

        // Draw the banner at the top of the final canvas
        ctx.drawImage(
          bannerImage,
          0, 0, // Position at the top of the final canvas
          finalCanvas.width, bannerImage.height // Full width of the banner
        );

        // Draw the cropped camera feed below the banner
        ctx.drawImage(
          cameraCanvas,
          0, cropMargin, // Start cropping from cropMargin on the y-axis
          arCanvas.width, targetHeight, // Draw the middle portion of the image
          0, bannerImage.height, // Position below the banner
          finalCanvas.width, targetHeight // Fit to the final canvas width and height
        );

        // Draw the cropped AR content on top of the camera feed
        ctx.drawImage(
          arCanvas,
          0, cropMargin, // Start cropping from cropMargin on the y-axis
          arCanvas.width, targetHeight, // Draw the middle portion of the image
          0, bannerImage.height, // Position below the banner
          finalCanvas.width, targetHeight // Fit to the final canvas width and height
        );

        // Convert the final canvas to a data URL and store it in localStorage
        const dataURL = finalCanvas.toDataURL('image/png');
        localStorage.setItem('capturedImage', dataURL);

        // Hide the prompt
        const prompt = document.getElementById("prompt");
        prompt.style.display = "none";

        console.log('Image processed and stored, redirecting to review page');

        // Redirect to the review page
        window.location.href = 'review.html';
      };

      bannerImage.onerror = () => {
        alert('Failed to load the banner image.');
      };

    } catch (err) {
      alert(err);
    }
  };




}

window.app = new App();

