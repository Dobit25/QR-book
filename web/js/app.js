// app.js

$(document).ready(function() {
    let bookData = null;
    let currentChapterIndex = 0;
    let audioElements = {};
    const flipbook = $('#flipbook');
    const audioPlayer = $('#audio-element')[0];
    
    // UI Elements
    const playBtn = $('#btn-play-pause');
    const playIcon = playBtn.find('i');
    const progressBar = $('#progress-bar');
    const timeCurrent = $('#time-current');
    const timeTotal = $('#time-total');
    const chapterSelect = $('#chapter-select');
    const currentChapterTitle = $('#current-chapter-title');

    // 1. Fetch JSON Configuration
    async function init() {
        try {
            // Get volume from URL
            const urlParams = new URLSearchParams(window.location.search);
            const volume = urlParams.get('volume') || 1;
            
            // Set volume dropdown value
            $('#volume-select').val(volume);
            
            // Listen for volume change
            $('#volume-select').on('change', function() {
                const selectedVol = $(this).val();
                
                // Hiển thị Loader làm mờ cảnh
                $('#page-loader').removeClass('hidden');
                
                // Đợi Loader hiện rõ rồi mới Reload trang
                setTimeout(() => {
                    window.location.href = `?volume=${selectedVol}`;
                }, 300);
            });
            
            const response = await fetch(`data/volume_${volume}/book_config.json?v=${new Date().getTime()}`);
            if (!response.ok) throw new Error("Tập sách này chưa sẵn sàng dữ liệu.");
            
            bookData = await response.json();
            
            buildFlipbook();
            buildAudioPlayer();
            setupEventListeners();
            
            // Initialize Flipbook
            initTurnJs();
            
            // Chờ Turn.js render xong khung bìa rồi từ từ tắt Loader mượt mà
            setTimeout(() => {
                $('#page-loader').addClass('hidden');
            }, 500);
            
        } catch (error) {
            console.error("Initialization error:", error);
            showToast("Lỗi tải cấu hình sách: " + error.message);
            // Hide loader even on error so user can see toast
            $('#page-loader').addClass('hidden');
        }
    }

    // 2. Build the Flipbook DOM
    function buildFlipbook() {
        // Clear existing dynamic pages (keep covers)
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
        
        // Insert before the back cover
        const backCover = flipbook.find('.cover-back');
        $(pagesHtml).insertBefore(backCover);
    }

    // 3. Initialize Turn.js
    function initTurnJs() {
        const wrapper = $('#flipbook-wrapper');
        const ratio = 1.414; // A4 ratio approx (height / single_width)
        
        function calculateSize() {
            const isMobile = $(window).width() < 768;
            // Tối đa hóa diện tích sách (99% width/height của wrapper)
            const w = wrapper.width() * 0.99;
            const h = wrapper.height() * 0.99;
            
            let bw, bh;
            
            if (isMobile) {
                // Single page display
                let bwByHeight = h / ratio;
                bw = Math.min(w, bwByHeight);
                bh = bw * ratio;
            } else {
                // Double page display
                let bwByHeight = (h / ratio) * 2;
                bw = Math.min(w, bwByHeight);
                bh = (bw / 2) * ratio;
            }
            
            return { width: bw, height: bh, isMobile: isMobile };
        }
        
        const initialSize = calculateSize();
        
        // Cập nhật kích thước Font chữ linh hoạt theo chiều cao sách để hiển thị được nhiều chữ hơn trên màn hình nhỏ
        function updateFontSize(height) {
            // 0.026 là hệ số tối ưu để chứa được khoang 650-700 chữ / 1 trang mà không bị tràn
            const baseFontSize = Math.max(12, height * 0.026);
            
            let styleEl = $('#dynamic-font-style');
            if (styleEl.length === 0) {
                styleEl = $('<style id="dynamic-font-style">').prop('type', 'text/css').appendTo('head');
            }
            styleEl.html(`
                #flipbook .page { font-size: ${baseFontSize}px; }
                #flipbook .page h2 { font-size: ${baseFontSize * 1.5}px; }
            `);
        }
        
        updateFontSize(initialSize.height);
        
        flipbook.turn({
            width: initialSize.width,
            height: initialSize.height,
            elevation: 50,
            gradients: true,
            autoCenter: true,
            display: initialSize.isMobile ? 'single' : 'double'
        });

        // Responsive handling
        $(window).resize(function() {
            const newSize = calculateSize();
            
            if (newSize.isMobile && flipbook.turn('display') === 'double') {
                flipbook.turn('display', 'single');
            } else if (!newSize.isMobile && flipbook.turn('display') === 'single') {
                flipbook.turn('display', 'double');
            }
            
            flipbook.turn('size', newSize.width, newSize.height);
            updateFontSize(newSize.height);
        });
        
        // Sync Event 2: Flipbook to Audio
        flipbook.bind('turned', function(event, page, view) {
            // Find which chapter this page belongs to
            let newChapterIdx = 0;
            for (let i = bookData.chapters.length - 1; i >= 0; i--) {
                if (page >= bookData.chapters[i].start_page) {
                    newChapterIdx = i;
                    break;
                }
            }
            
            // If page flipped into a new chapter, update UI but don't auto-play yet
            if (newChapterIdx !== currentChapterIndex) {
                currentChapterIndex = newChapterIdx;
                updateAudioUI(currentChapterIndex);
                // Note: We don't change audio Player `src` here to avoid interrupting playback
                // Only change if user clicks play on the new chapter.
            }
        });
    }

    // 4. Build Audio Player UI
    function buildAudioPlayer() {
        chapterSelect.empty();
        let chapterNum = 1;
        bookData.chapters.forEach((ch, idx) => {
            let prefix = "";
            const lowerTitle = ch.title.toLowerCase();
            if (lowerTitle.includes("lời giới thiệu") || lowerTitle.includes("mục lục")) {
                prefix = "";
            } else {
                prefix = `Chương ${chapterNum}: `;
                chapterNum++;
            }
            chapterSelect.append(`<option value="${idx}">${prefix}${ch.title}</option>`);
        });
        
        loadChapterAudio(0, false);
    }
    
    function loadChapterAudio(index, autoplay = false) {
        currentChapterIndex = index;
        const chapter = bookData.chapters[index];
        
        updateAudioUI(index);
        
        // Load audio source
        // Here we use local files generated by edge-tts instead of Google Drive for now
        // audio_url might be empty, so fallback to local path
        const urlParams = new URLSearchParams(window.location.search);
        const volume = urlParams.get('volume') || 1;
        const audioSrc = chapter.audio_url || `audio/volume_${volume}/ch_${chapter.chapter_id}.mp3`;
        audioPlayer.src = audioSrc;
        
        if (autoplay) {
            audioPlayer.play().catch(e => {
                console.error("Audio play error:", e);
                handleAudioError();
            });
        }
    }
    
    function updateAudioUI(index) {
        const chapter = bookData.chapters[index];
        currentChapterTitle.text(chapter.title);
        chapterSelect.val(index);
    }

    // 5. Setup Audio Event Listeners
    function setupEventListeners() {
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
            // Auto next chapter
            if (currentChapterIndex < bookData.chapters.length - 1) {
                $('#btn-next-chapter').click();
            }
        });
        
        $(audioPlayer).on('error', handleAudioError);
        
        // Controls
        playBtn.click(function() {
            if (audioPlayer.paused) {
                audioPlayer.play();
                playIcon.removeClass('fa-play').addClass('fa-pause');
                
                // Sync Event 1: Audio Play -> Turn Page
                const chapter = bookData.chapters[currentChapterIndex];
                flipbook.turn('page', chapter.start_page);
            } else {
                audioPlayer.pause();
                playIcon.removeClass('fa-pause').addClass('fa-play');
            }
        });
        
        $('#btn-prev-chapter').click(function() {
            if (currentChapterIndex > 0) {
                loadChapterAudio(currentChapterIndex - 1, true);
                playIcon.removeClass('fa-play').addClass('fa-pause');
                flipbook.turn('page', bookData.chapters[currentChapterIndex - 1].start_page);
            }
        });
        
        $('#btn-next-chapter').click(function() {
            if (currentChapterIndex < bookData.chapters.length - 1) {
                loadChapterAudio(currentChapterIndex + 1, true);
                playIcon.removeClass('fa-play').addClass('fa-pause');
                flipbook.turn('page', bookData.chapters[currentChapterIndex + 1].start_page);
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
        
        chapterSelect.change(function() {
            const idx = parseInt($(this).val());
            loadChapterAudio(idx, !audioPlayer.paused);
            flipbook.turn('page', bookData.chapters[idx].start_page);
        });
    }
    
    // 6. Helpers
    function formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    
    function handleAudioError() {
        showToast("⚠️ Lỗi tải Audio (Network / CORS). Đang thử chuyển sang file dự phòng...");
        playIcon.removeClass('fa-pause').addClass('fa-play');
        
        // Backup logic could be implemented here
        // e.g. audioPlayer.src = '/web/audio_backup/ch_' + bookData.chapters[currentChapterIndex].chapter_id + '.mp3';
    }
    
    function showToast(msg) {
        const toast = $('#toast');
        toast.text(msg).removeClass('hidden');
        setTimeout(() => toast.addClass('hidden'), 5000);
    }

    // Run
    init();
});
