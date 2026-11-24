(() => {
    const MUSIC_VIDEO_ID = 'a2OiVGySjOY';
    const THEME_STORAGE_KEY = 'lordfarhan-neon-theme';

    const controls = document.createElement('div');
    controls.className = 'site-controls';
    controls.innerHTML = `
        <section class="site-controls__player" id="moonlightPlayer" aria-label="Moonlight music player" hidden>
            <div class="site-controls__player-head">
                <span>MOTI THE NRG — MOONLIGHT</span>
                <span>
                    <a href="https://www.youtube.com/watch?v=${MUSIC_VIDEO_ID}" target="_blank" rel="noopener noreferrer" aria-label="Open the official Moonlight video on YouTube">Official video</a>
                    <button class="site-controls__close" id="closeMoonlight" type="button" aria-label="Close music player">&times;</button>
                </span>
            </div>
            <iframe class="site-controls__video" id="moonlightFrame" title="MOTI THE NRG - MOONLIGHT official music video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>
        </section>
        <div class="site-controls__actions">
            <button class="site-controls__button" id="neonThemeToggle" type="button" aria-pressed="false" title="Switch neon color palette">
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

    let theme = 'pink';
    try {
        theme = localStorage.getItem(THEME_STORAGE_KEY) === 'cyan' ? 'cyan' : 'pink';
    } catch {
        // The control still works for this page if browser storage is unavailable.
    }

    function applyTheme() {
        document.body.dataset.neonTheme = theme;
        const isCyan = theme === 'cyan';
        themeButton.setAttribute('aria-pressed', String(isCyan));
        themeButton.setAttribute('aria-label', `Neon color palette: ${isCyan ? 'cyan' : 'pink'}. Switch to ${isCyan ? 'pink' : 'cyan'}.`);
        themeLabel.textContent = `Neon: ${isCyan ? 'Cyan' : 'Pink'}`;
        const themeColor = getComputedStyle(document.body).getPropertyValue('--pink').trim();
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor || (isCyan ? '#39edf7' : '#ff2d95'));
        try {
            localStorage.setItem(THEME_STORAGE_KEY, theme);
        } catch {
            // Keep the selected palette for the current page.
        }
    }

    function closeMusicPlayer() {
        player.hidden = true;
        frame.removeAttribute('src');
        musicButton.setAttribute('aria-expanded', 'false');
        musicLabel.textContent = 'Play Moonlight';
    }

    themeButton.addEventListener('click', () => {
        theme = theme === 'pink' ? 'cyan' : 'pink';
        applyTheme();
    });

    musicButton.addEventListener('click', () => {
        if (!player.hidden) {
            closeMusicPlayer();
            return;
        }
        player.hidden = false;
        musicButton.setAttribute('aria-expanded', 'true');
        musicLabel.textContent = 'Close music';
        frame.src = `https://www.youtube-nocookie.com/embed/${MUSIC_VIDEO_ID}?autoplay=1&controls=1&playsinline=1&rel=0`;
    });

    closeMusicButton.addEventListener('click', closeMusicPlayer);
    applyTheme();
})();
