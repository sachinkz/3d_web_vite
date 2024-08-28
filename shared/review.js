// Retrieve the image data from localStorage
const imageData = localStorage.getItem('capturedImage');

if (imageData) {
    const img = document.getElementById('captured-image');
    img.src = imageData;

    const canvas = document.getElementById('final-canvas');
    const ctx = canvas.getContext('2d');

    // Load the image into the canvas
    const image = new Image();
    image.src = imageData;
    image.onload = () => {
        // Set canvas size to image size
        canvas.width = image.width;
        canvas.height = image.height;

        // Flip the image vertically
        ctx.save(); // Save the current state
        ctx.translate(0, canvas.height); // Move to the bottom of the canvas
        ctx.scale(1, -1); // Flip vertically
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height); // Draw the image
        ctx.restore(); // Restore the state

        // Convert the canvas to a Blob
        canvas.toBlob((blob) => {
            const file = new File([blob], 'captured_image.png', { type: 'image/png' });

            // Set up download link
            const downloadButton = document.getElementById('download-button');
            const downloadURL = URL.createObjectURL(file);
            downloadButton.href = downloadURL;
            downloadButton.download = 'captured_image.png';

            // Set up share button
            const shareButton = document.getElementById('share-button');
            shareButton.onclick = () => {
                if (navigator.share) {
                    navigator.share({
                        title: 'Captured Image',
                        text: 'Check out this image captured from AR!',
                        files: [file]
                    }).catch(console.error);
                } else {
                    alert('Sharing not supported on this device.');
                }
            };
        });
    };
} else {
    alert('No image data available.');
}
