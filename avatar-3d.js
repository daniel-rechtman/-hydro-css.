// === 3D Avatar Controller ===

(function () {
    const stage = document.getElementById('avatarStage');
    const scene = document.getElementById('avatarScene');
    const body = document.querySelector('.avatar-body');

    // --- Mouse / Touch rotation ---
    let rotX = -10;
    let rotY = 0;
    let isDragging = false;
    let lastX = 0;
    let lastY = 0;

    function updateRotation() {
        scene.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`;
    }

    stage.addEventListener('mousedown', (e) => {
        isDragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        stage.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
        // Eye tracking
        trackEyes(e.clientX, e.clientY);

        if (!isDragging) return;
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        rotY += dx * 0.5;
        rotX -= dy * 0.5;
        rotX = Math.max(-40, Math.min(40, rotX));
        lastX = e.clientX;
        lastY = e.clientY;
        updateRotation();
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
        stage.style.cursor = 'grab';
    });

    // Touch support
    stage.addEventListener('touchstart', (e) => {
        isDragging = true;
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        const dx = e.touches[0].clientX - lastX;
        const dy = e.touches[0].clientY - lastY;
        rotY += dx * 0.5;
        rotX -= dy * 0.5;
        rotX = Math.max(-40, Math.min(40, rotX));
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
        updateRotation();
    }, { passive: true });

    window.addEventListener('touchend', () => {
        isDragging = false;
    });

    // --- Eye tracking ---
    function trackEyes(mx, my) {
        const pupils = document.querySelectorAll('.pupil');
        const stageRect = stage.getBoundingClientRect();
        const cx = stageRect.left + stageRect.width / 2;
        const cy = stageRect.top + stageRect.height / 2 - 80;

        const dx = (mx - cx) / window.innerWidth * 6;
        const dy = (my - cy) / window.innerHeight * 4;

        const clampedX = Math.max(-3, Math.min(3, dx));
        const clampedY = Math.max(-2, Math.min(2, dy));

        pupils.forEach((p) => {
            p.style.transform = `translate(calc(-50% + ${clampedX}px), calc(-50% + ${clampedY}px))`;
        });
    }

    // --- Action buttons ---
    const buttons = document.querySelectorAll('.control-btn');
    let animating = false;

    buttons.forEach((btn) => {
        btn.addEventListener('click', () => {
            if (animating) return;
            const action = btn.dataset.action;
            animating = true;

            body.classList.add(action);

            const durations = { wave: 1000, jump: 600, spin: 800, dance: 1500 };
            setTimeout(() => {
                body.classList.remove(action);
                animating = false;
            }, durations[action] || 1000);
        });
    });

    // --- Color customizer ---
    const swatches = document.querySelectorAll('.color-swatch');

    swatches.forEach((swatch) => {
        swatch.addEventListener('click', () => {
            const target = swatch.closest('.color-options').dataset.target;
            const color = swatch.dataset.color;

            // Update active state
            swatch.closest('.color-options').querySelectorAll('.color-swatch').forEach((s) => {
                s.classList.remove('active');
            });
            swatch.classList.add('active');

            applyColor(target, color);
        });
    });

    function applyColor(target, color) {
        const root = document.querySelector('.avatar-body');
        switch (target) {
            case 'shirt':
                root.style.setProperty('--shirt-color', color);
                applyToFaces('.torso-face', color);
                applyToFaces('.arm-face:not(.bottom):not(.avatar-hand .arm-face)', color);
                break;
            case 'cap':
                root.style.setProperty('--cap-color', color);
                document.querySelectorAll('.cap-face, .cap-brim').forEach((el) => {
                    el.style.backgroundColor = color;
                });
                break;
            case 'hair':
                root.style.setProperty('--hair-color', color);
                document.querySelectorAll('.hair-top, .hair-side').forEach((el) => {
                    el.style.backgroundColor = color;
                });
                break;
            case 'pants':
                root.style.setProperty('--pants-color', color);
                applyToFaces('.leg-face', color);
                break;
            case 'skin':
                root.style.setProperty('--skin-color', color);
                document.querySelectorAll('.head-face, .nose').forEach((el) => {
                    el.style.backgroundColor = color;
                });
                document.querySelectorAll('.hand-face').forEach((el) => {
                    el.style.backgroundColor = color;
                });
                document.querySelector('.avatar-neck').style.backgroundColor = color;
                document.querySelectorAll('.arm-face.bottom').forEach((el) => {
                    el.style.backgroundColor = color;
                });
                break;
        }
    }

    function applyToFaces(selector, color) {
        document.querySelectorAll(selector).forEach((el) => {
            el.style.backgroundColor = color;
        });
    }

    // Initial rotation
    updateRotation();
})();
