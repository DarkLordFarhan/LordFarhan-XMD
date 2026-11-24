(() => {
    const MUSIC_VIDEO_ID = 'a2OiVGySjOY';
    const THEME_STORAGE_KEY = 'lordfarhan-neon-theme';
    const THEMES = [
        { id: 'pink', label: 'Pink' },
        { id: 'cyan', label: 'Cyan' },
        { id: 'violet', label: 'Violet' },
        { id: 'lime', label: 'Lime' },
        { id: 'blue', label: 'Blue' },
        { id: 'amber', label: 'Amber' },
        { id: 'red', label: 'Red' },
        { id: 'mint', label: 'Mint' },
        { id: 'gold', label: 'Gold' },
    ];

    const controls = document.createElement('div');
    controls.className = 'site-controls';
    controls.innerHTML = `
        <section class="site-controls__player" id="moonlightPlayer" aria-label="Moonlight music player" hidden>
            <div class="site-controls__player-head">
                <span>MOTI THE NRG — MOONLIGHT</span>
                <span class="site-controls__player-links">
                    <a href="https://www.youtube.com/watch?v=${MUSIC_VIDEO_ID}" target="_blank" rel="noopener noreferrer" aria-label="Open the official Moonlight video on YouTube">Official video</a>
                    <button class="site-controls__close" id="closeMoonlight" type="button" aria-label="Close music player">&times;</button>
                </span>
            </div>
            <iframe class="site-controls__video" id="moonlightFrame" title="MOTI THE NRG - MOONLIGHT official music video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="eager" referrerpolicy="strict-origin-when-cross-origin"></iframe>
            <p class="site-controls__player-hint">Autoplay is attempted on page load. If your browser blocks sound, press Play in the video.</p>
        </section>
        <div class="site-controls__actions">
            <button class="site-controls__button" id="neonThemeToggle" type="button" title="Cycle neon color palette">
                <i class="fas fa-lightbulb" aria-hidden="true"></i><span id="neonThemeLabel">Neon: Pink</span>
            </button>
            <button class="site-controls__button" id="moonlightToggle" type="button" aria-expanded="false" aria-controls="moonlightPlayer">
                <i class="fas fa-music" aria-hidden="true"></i><span id="moonlightLabel">Play Moonlight</span>
            </button>
        </div>
    `;
    document.body.appendChild(controls);

    const themeButton = controls.querySelector('#neonThemeToggle');
    const themeLabel = controls.querySelector('#neonThemeLabel');
    const musicButton = controls.querySelector('#moonlightToggle');
    const musicLabel = controls.querySelector('#moonlightLabel');
    const player = controls.querySelector('#moonlightPlayer');
    const frame = controls.querySelector('#moonlightFrame');
    const closeMusicButton = controls.querySelector('#closeMoonlight');

    function getThemeIndex(themeId) {
        const index = THEMES.findIndex((themeItem) => themeItem.id === themeId);
        return index < 0 ? 0 : index;
    }

    let themeIndex = 0;
    try {
        themeIndex = getThemeIndex(localStorage.getItem(THEME_STORAGE_KEY));
    } catch {
        // The color cycle still works on this page if browser storage is unavailable.
    }

    function applyTheme() {
        const theme = THEMES[themeIndex];
        const nextTheme = THEMES[(themeIndex + 1) % THEMES.length];
        document.body.dataset.neonTheme = theme.id;
        themeButton.setAttribute('aria-label', `Current neon color: ${theme.label}. Switch to ${nextTheme.label}.`);
        themeButton.title = `Current: ${theme.label}. Tap to switch to ${nextTheme.label}.`;
        themeLabel.textContent = `Neon: ${theme.label}`;
        const themeColor = getComputedStyle(document.body).getPropertyValue('--pink').trim();
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor || '#ff2d95');
        try {
            localStorage.setItem(THEME_STORAGE_KEY, theme.id);
        } catch {
            // Keep the selected palette for the current page.
        }
    }

    function openMusicPlayer() {
        player.hidden = false;
        musicButton.setAttribute('aria-expanded', 'true');
        musicLabel.textContent = 'Close music';
        if (!frame.src || !frame.src.includes(MUSIC_VIDEO_ID)) {
            frame.src = `https://www.youtube-nocookie.com/embed/${MUSIC_VIDEO_ID}?autoplay=1&controls=1&playsinline=1&rel=0`;
        }
    }

    function closeMusicPlayer() {
        player.hidden = true;
        frame.removeAttribute('src');
        musicButton.setAttribute('aria-expanded', 'false');
        musicLabel.textContent = 'Play Moonlight';
    }

    themeButton.addEventListener('click', () => {
        themeIndex = (themeIndex + 1) % THEMES.length;
        applyTheme();
    });

    musicButton.addEventListener('click', () => {
        if (!player.hidden) {
            closeMusicPlayer();
            return;
        }
        openMusicPlayer();
    });

    closeMusicButton.addEventListener('click', closeMusicPlayer);
    applyTheme();
    openMusicPlayer();
})();
