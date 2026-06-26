// app.js

$(document).ready(function() {
    let bookData = null;
    const flipbook = $('#flipbook');
    const wrapper = $('#flipbook-wrapper');
    const audioPlayer = $('#audio-element')[0];
    const sfxPlayer = $('#sfx-player')[0];
    
    // UI Elements
    const playBtn = $('#btn-play-pause');
    const playIcon = playBtn.find('i');
    const progressBar = $('#progress-bar');
    const timeCurrent = $('#time-current');
    const timeTotal = $('#time-total');
    const pageIndicator = $('#page-indicator');
    
    // Zoom state
    let currentZoom = 1;

    // 1. Fetch JSON Configuration
    async function init() {
        try {
            // Get volume from URL
            const urlParams = new URLSearchParams(window.location.search);
            const volume = urlParams.get('volume') || 1;
            
            const response = await fetch(`data/volume_${volume}/book_config.json?v=${new Date().getTime()}`);
            if (!response.ok) throw new Error("Tập sách này chưa sẵn sàng dữ liệu.");
            
            bookData = await response.json();
            
            buildFlipbook();
            setupAudioPlayer();
            setupEventListeners();
            initTurnJs();
            
            // Hide global loader
            setTimeout(() => {
                $('#page-loader').addClass('hidden');
            }, 500);
            
        } catch (error) {
            console.error("Initialization error:", error);
            showToast("Lỗi tải cấu hình sách: " + error.message);
            $('#page-loader').addClass('hidden');
        }
    }

    // 2. Build the Flipbook DOM
    function buildFlipbook() {
        flipbook.find('.page:not(.hard)').remove();
        
        let pagesHtml = '';
        bookData.pages.forEach(page => {
            const contentHtml = `
                <img src="${page.image_url}" class="page-image" alt="Trang ${page.page_number}" draggable="false" />
            `;
            pagesHtml += `<div class="page" data-page-num="${page.page_number}">
                ${contentHtml}
            </div>`;
        });
        
        const backCover = flipbook.find('.cover-back');
        $(pagesHtml).insertBefore(backCover);
    }

    // 3. Initialize Turn.js
    const ratio = 1.414; 
    
    function calculateSize() {
        const isMobile = $(window).width() < 768;
        const w = wrapper.width() * 0.99;
        const h = wrapper.height() * 0.99;
        
        let bw, bh;
        if (isMobile) {
            let bwByHeight = h / ratio;
            bw = Math.min(w, bwByHeight);
            bh = bw * ratio;
        } else {
            let bwByHeight = (h / ratio) * 2;
            bw = Math.min(w, bwByHeight);
            bh = (bw / 2) * ratio;
        }
        return { width: bw, height: bh, isMobile: isMobile };
    }

    function initTurnJs() {
        const initialSize = calculateSize();
        
        flipbook.turn({
            width: initialSize.width,
            height: initialSize.height,
            elevation: 50,
            gradients: true,
            autoCenter: true,
            display: initialSize.isMobile ? 'single' : 'double'
        });

        // Navigation Overlays Logic
        $('#nav-prev').click(function(e) {
            e.preventDefault();
            flipbook.turn('previous');
        });
        
        $('#nav-next').click(function(e) {
            e.preventDefault();
            flipbook.turn('next');
        });

        // Responsive handling
        $(window).resize(function() {
            const newSize = calculateSize();
            if (newSize.isMobile && flipbook.turn('display') === 'double') {
                flipbook.turn('display', 'single');
            } else if (!newSize.isMobile && flipbook.turn('display') === 'single') {
                flipbook.turn('display', 'double');
            }
            flipbook.turn('size', newSize.width * currentZoom, newSize.height * currentZoom);
        });
        
        // Page Flip SFX and Page Indicator
        flipbook.bind('turning', function(event, page, view) {
            // Play SFX
            sfxPlayer.currentTime = 0;
            sfxPlayer.play().catch(e => console.log('SFX block', e));
        });

        flipbook.bind('turned', function(event, page, view) {
            // Update Page Indicator
            const totalPages = flipbook.turn('pages');
            pageIndicator.text(`Page: ${page} / ${totalPages}`);
        });
    }

    // 4. Setup Audio Player
    function setupAudioPlayer() {
        audioPlayer.src = 'audio/intro_audio.m4a';
        audioPlayer.load();
        
        // Extract timeTotal immediately if possible
        $(audioPlayer).on('loadedmetadata', function() {
            timeTotal.text(formatTime(audioPlayer.duration));
        });
    }

    // 5. Setup Event Listeners
    function setupEventListeners() {
        // Intro Poster Start Button
        $('#btn-start-experience').click(function() {
            $('#intro-poster').addClass('hidden');
            
            // Start audio
            audioPlayer.play().catch(e => {
                console.error("Audio play error:", e);
                showToast("Lỗi phát âm thanh. Vui lòng thử lại.");
            });
            playIcon.removeClass('fa-play').addClass('fa-pause');
            
            // Turn to cover
            flipbook.turn('page', 1);
        });

        // Audio Player Events
        $(audioPlayer).on('timeupdate', function() {
            const current = audioPlayer.currentTime;
            const total = audioPlayer.duration;
            if (!isNaN(total) && total > 0) {
                progressBar.val((current / total) * 100);
                timeCurrent.text(formatTime(current));
                timeTotal.text(formatTime(total));
            }
        });
        
        $(audioPlayer).on('ended', function() {
            playIcon.removeClass('fa-pause').addClass('fa-play');
        });
        
        $(audioPlayer).on('error', handleAudioError);
        
        // Audio Controls
        playBtn.click(function() {
            if (audioPlayer.paused) {
                audioPlayer.play();
                playIcon.removeClass('fa-play').addClass('fa-pause');
            } else {
                audioPlayer.pause();
                playIcon.removeClass('fa-pause').addClass('fa-play');
            }
        });
        
        $('#btn-rewind').click(function() {
            audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 15);
        });
        
        $('#btn-forward').click(function() {
            audioPlayer.currentTime = Math.min(audioPlayer.duration, audioPlayer.currentTime + 15);
        });
        
        progressBar.on('input', function() {
            if (!isNaN(audioPlayer.duration)) {
                const time = (progressBar.val() / 100) * audioPlayer.duration;
                audioPlayer.currentTime = time;
            }
        });

        // Extra Controls
        // Zoom and Pan state
        let currentTranslateX = 0;
        let currentTranslateY = 0;
        let isDragging = false;
        let startX, startY;

        function applyZoom() {
            if (currentZoom === 1) {
                currentTranslateX = 0;
                currentTranslateY = 0;
                flipbook.css({
                    'transform': 'none',
                    'transition': 'transform 0.3s ease'
                });
            } else {
                flipbook.css({
                    'transform': `scale(${currentZoom}) translate(${currentTranslateX}px, ${currentTranslateY}px)`,
                    'transform-origin': 'center center',
                    'transition': 'transform 0.3s ease'
                });
            }
        }
        
        $('#btn-zoom-in').click(function() {
            currentZoom = Math.min(currentZoom + 0.3, 3);
            applyZoom();
        });

        $('#btn-zoom-out').click(function() {
            currentZoom = Math.max(currentZoom - 0.3, 1);
            applyZoom();
        });

        // Drag to Pan
        wrapper.on('mousedown touchstart', function(e) {
            if (currentZoom <= 1) return;
            // Prevent default to avoid selection issues
            if (e.type === 'mousedown') e.preventDefault();
            
            isDragging = true;
            flipbook.css('transition', 'none');
            const pageX = e.pageX || (e.originalEvent.touches && e.originalEvent.touches[0].pageX);
            const pageY = e.pageY || (e.originalEvent.touches && e.originalEvent.touches[0].pageY);
            
            startX = pageX - (currentTranslateX * currentZoom);
            startY = pageY - (currentTranslateY * currentZoom);
        });

        $(window).on('mousemove touchmove', function(e) {
            if (!isDragging || currentZoom <= 1) return;
            const pageX = e.pageX || (e.originalEvent.touches && e.originalEvent.touches[0].pageX);
            const pageY = e.pageY || (e.originalEvent.touches && e.originalEvent.touches[0].pageY);
            
            currentTranslateX = (pageX - startX) / currentZoom;
            currentTranslateY = (pageY - startY) / currentZoom;
            
            flipbook.css('transform', `scale(${currentZoom}) translate(${currentTranslateX}px, ${currentTranslateY}px)`);
        });

        $(window).on('mouseup touchend', function() {
            if (isDragging) {
                isDragging = false;
                flipbook.css('transition', 'transform 0.3s ease');
            }
        });
        
        // Page Navigation Buttons
        $('#btn-page-prev').click(function() {
            flipbook.turn('previous');
        });
        
        $('#btn-page-next').click(function() {
            flipbook.turn('next');
        });

        // Fullscreen
        $('#btn-fullscreen').click(function() {
            const elem = document.documentElement;
            if (!document.fullscreenElement) {
                if (elem.requestFullscreen) {
                    elem.requestFullscreen();
                } else if (elem.webkitRequestFullscreen) { /* Safari */
                    elem.webkitRequestFullscreen();
                } else if (elem.msRequestFullscreen) { /* IE11 */
                    elem.msRequestFullscreen();
                }
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                } else if (document.webkitExitFullscreen) { /* Safari */
                    document.webkitExitFullscreen();
                } else if (document.msExitFullscreen) { /* IE11 */
                    document.msExitFullscreen();
                }
            }
        });
    }
    
    // 6. Helpers
    function formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    
    function handleAudioError() {
        showToast("⚠️ Lỗi tải Audio.");
        playIcon.removeClass('fa-pause').addClass('fa-play');
    }
    
    function showToast(msg) {
        const toast = $('#toast');
        toast.text(msg).removeClass('hidden');
        setTimeout(() => toast.addClass('hidden'), 5000);
    }

    // Run
    init();
});
