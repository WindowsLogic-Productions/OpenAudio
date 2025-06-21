class MusicPlayer {
  constructor() {
    this.audio = new Audio();
    this.playlist = [];
    this.currentTrackIndex = 0;
    this.isPlaying = false;
    this.isShuffled = false;
    this.repeatMode = 'none'; // none, one, all
    this.visualizerBars = [];
    this.audioContext = null;
    this.analyser = null;
    this.dataArray = null;
    this.animationFrameId = null;
    this.lastVolume = 1; // Added to remember last volume

    this.setupEventListeners();
    this.createVisualizer();
    this.loadDemoPlaylist();
    this.setupFileInputs();
    this.setupVolumeControl(); // Added volume control setup
  }
  
  setupEventListeners() {
    // Button controls
    document.getElementById('playBtn').addEventListener('click', () => this.togglePlay());
    document.getElementById('prevBtn').addEventListener('click', () => this.previousTrack());
    document.getElementById('nextBtn').addEventListener('click', () => this.nextTrack());
    document.getElementById('shuffleBtn').addEventListener('click', () => this.toggleShuffle());
    document.getElementById('repeatBtn').addEventListener('click', () => this.toggleRepeat());
    document.getElementById('randomBtn').addEventListener('click', () => this.playRandomTrack());
    
    // Progress bar
    document.getElementById('progressContainer').addEventListener('click', (e) => {
      const container = e.currentTarget;
      const clickPosition = (e.clientX - container.getBoundingClientRect().left) / container.offsetWidth;
      this.audio.currentTime = this.audio.duration * clickPosition;
    });
    
    // Audio events
    this.audio.addEventListener('timeupdate', () => this.updateProgress());
    this.audio.addEventListener('ended', () => this.handleTrackEnd());
    
    // Duration change listener
    this.audio.addEventListener('durationchange', () => {
      document.getElementById('totalTime').textContent = this.formatTime(this.audio.duration);
    });
  }
  
  setupAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048; // Increased for better frequency resolution
      this.analyser.minDecibels = -90;
      this.analyser.maxDecibels = -10;
      this.analyser.smoothingTimeConstant = 0.85;
      
      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);
      
      const source = this.audioContext.createMediaElementSource(this.audio);
      source.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
    }
  }

  createVisualizer() {
    const visualizer = document.getElementById('visualizer');
    for (let i = 0; i < 96; i++) { // Reduced from 128 to 96 bars
      const bar = document.createElement('div');
      bar.className = 'bar';
      visualizer.appendChild(bar);
      this.visualizerBars.push(bar);
    }
  }
  
  updateVisualizer() {
    if (!this.isPlaying) {
      this.visualizerBars.forEach(bar => {
        bar.style.height = '5px';  /* Updated from 10px to match new default */
        bar.style.animation = 'none';
      });
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
      return;
    }

    this.analyser.getByteFrequencyData(this.dataArray);
    
    // Calculate frequency range for each bar
    const sampleRate = this.audioContext.sampleRate;
    const binCount = this.analyser.frequencyBinCount;
    const minFreq = 20; // 20 Hz
    const maxFreq = 20000; // 20 kHz
    
    // Helper function to convert frequency to bin index
    const freqToBin = (freq) => Math.round((freq * binCount) / sampleRate);
    
    const minBin = freqToBin(minFreq);
    const maxBin = freqToBin(maxFreq);
    
    // Divide the frequency range logarithmically for the bars
    const barCount = this.visualizerBars.length;
    const logMin = Math.log10(minFreq);
    const logMax = Math.log10(maxFreq);
    const logRange = logMax - logMin;
    
    this.visualizerBars.forEach((bar, index) => {
      // Calculate frequency range for this bar
      const freqStart = Math.pow(10, logMin + (index / barCount) * logRange);
      const freqEnd = Math.pow(10, logMin + ((index + 1) / barCount) * logRange);
      
      // Convert frequencies to bin indices
      const startBin = Math.max(minBin, freqToBin(freqStart));
      const endBin = Math.min(maxBin, freqToBin(freqEnd));
      
      // Calculate average amplitude for the frequency range
      let sum = 0;
      for (let i = startBin; i <= endBin; i++) {
        sum += this.dataArray[i];
      }
      const average = sum / (endBin - startBin + 1);
      
      // Apply scaling and set bar height
      const height = average * 0.15 + 3;
      bar.style.height = `${height}px`;
    });

    this.animationFrameId = requestAnimationFrame(() => this.updateVisualizer());
  }
  
  loadDemoPlaylist() {
    this.playlist = [];
    this.renderPlaylist();
  }
  
  setupFileInputs() {
    const fileInput = document.getElementById('fileInput');
    const dragArea = document.getElementById('dragArea');

    fileInput.addEventListener('change', (e) => {
      this.handleFiles(e.target.files);
    });

    // Drag and drop handlers
    dragArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      dragArea.classList.add('dragover');
    });

    dragArea.addEventListener('dragleave', () => {
      dragArea.classList.remove('dragover');
    });

    dragArea.addEventListener('drop', (e) => {
      e.preventDefault();
      dragArea.classList.remove('dragover');
      const files = e.dataTransfer.files;
      this.handleFiles(files);
    });
  }

  handleFiles(files) {
    const promises = Array.from(files).map(file => {
      if (file.type.startsWith('audio/')) {
        return new Promise((resolve) => {
          const audio = new Audio();
          audio.src = URL.createObjectURL(file);
          audio.addEventListener('loadedmetadata', () => {
            resolve({
              title: file.name.replace(/\.[^/.]+$/, ''),
              artist: 'Local File',
              url: audio.src,
              duration: audio.duration
            });
          });
        });
      }
    });

    Promise.all(promises).then(tracks => {
      this.playlist.push(...tracks.filter(t => t));
      this.renderPlaylist();
      
      // If this is the first track added, start playing
      if (this.playlist.length === tracks.length) {
        this.playTrack(0);
      }
    });
  }

  renderPlaylist() {
    const playlistContainer = document.getElementById('playlist');
    playlistContainer.innerHTML = '';
    
    this.playlist.forEach((track, index) => {
      const item = document.createElement('div');
      item.className = `playlist-item ${index === this.currentTrackIndex ? 'active' : ''}`;
      item.innerHTML = `
        <span>${track.title} - ${track.artist}</span>
        <span>${this.formatTime(track.duration || 0)}</span>
      `;
      item.addEventListener('click', () => this.playTrack(index));
      playlistContainer.appendChild(item);
    });
  }
  
  togglePlay() {
    if (this.audio.src) {
      if (this.audioContext?.state === 'suspended') {
        this.audioContext.resume();
      }
      
      if (this.isPlaying) {
        this.audio.pause();
      } else {
        this.audio.play();
      }
      this.isPlaying = !this.isPlaying;
      this.updatePlayButton();
      this.updateVisualizer();
    } else if (this.playlist.length > 0) {
      this.playTrack(0);
    }
  }
  
  playTrack(index) {
    if (this.audioContext?.state === 'suspended') {
      this.audioContext.resume();
    }
    
    if (!this.audioContext) {
      this.setupAudioContext();
    }
    
    this.currentTrackIndex = index;
    const track = this.playlist[index];
    
    this.audio.src = track.url;
    this.audio.play();
    
    document.getElementById('trackTitle').textContent = track.title;
    document.getElementById('trackArtist').textContent = track.artist;
    
    this.isPlaying = true;
    this.updatePlayButton();
    this.renderPlaylist();
    this.updateVisualizer();
  }
  
  previousTrack() {
    let newIndex = this.currentTrackIndex - 1;
    if (newIndex < 0) newIndex = this.playlist.length - 1;
    this.playTrack(newIndex);
  }
  
  nextTrack() {
    let newIndex = this.currentTrackIndex + 1;
    if (newIndex >= this.playlist.length) newIndex = 0;
    this.playTrack(newIndex);
  }
  
  toggleShuffle() {
    this.isShuffled = !this.isShuffled;
    document.getElementById('shuffleBtn').classList.toggle('active');
  }
  
  toggleRepeat() {
    const modes = ['none', 'one', 'all'];
    const currentIndex = modes.indexOf(this.repeatMode);
    this.repeatMode = modes[(currentIndex + 1) % modes.length];
    
    const btn = document.getElementById('repeatBtn');
    const repeatIcon = document.getElementById('repeatIcon');
    const repeatOneIndicator = document.getElementById('repeatOneIndicator');
    
    // Update visual state
    btn.classList.remove('active');
    repeatOneIndicator.style.display = 'none';
    
    switch(this.repeatMode) {
      case 'one':
        btn.classList.add('active');
        repeatOneIndicator.style.display = 'block';
        btn.title = "Repeat One";
        break;
      case 'all':
        btn.classList.add('active');
        btn.title = "Repeat All";
        break;
      default:
        btn.title = "Repeat Off";
    }
  }
  
  updateProgress() {
    const progress = (this.audio.currentTime / this.audio.duration) * 100 || 0;
    document.getElementById('progressBar').style.width = `${progress}%`;
    
    // Update time displays
    document.getElementById('currentTime').textContent = this.formatTime(this.audio.currentTime);
    document.getElementById('totalTime').textContent = this.formatTime(this.audio.duration || 0);
  }
  
  handleTrackEnd() {
    if (this.repeatMode === 'one') {
      this.audio.play();
    } else if (this.repeatMode === 'all' || this.isShuffled) {
      this.nextTrack();
    } else if (this.currentTrackIndex < this.playlist.length - 1) {
      this.nextTrack();
    }
  }
  
  updatePlayButton() {
    const playIcon = document.getElementById('playIcon');
    playIcon.className = this.isPlaying ? 'fas fa-pause' : 'fas fa-play';
  }
  
  playRandomTrack() {
    if (this.playlist.length > 0) {
      let randomIndex;
      do {
        randomIndex = Math.floor(Math.random() * this.playlist.length);
      } while (randomIndex === this.currentTrackIndex && this.playlist.length > 1);
      
      this.playTrack(randomIndex);
    }
  }
  
  formatTime(seconds) {
    seconds = Math.floor(seconds);
    const minutes = Math.floor(seconds / 60);
    seconds = seconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  setupVolumeControl() {
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeBtn = document.getElementById('volumeBtn');
    const volumeIcon = document.getElementById('volumeIcon');

    // Set initial volume
    this.audio.volume = volumeSlider.value / 100;

    volumeSlider.addEventListener('input', (e) => {
      const volume = e.target.value / 100;
      this.audio.volume = volume;
      this.updateVolumeIcon(volume);
    });

    volumeBtn.addEventListener('click', () => {
      if (this.audio.volume > 0) {
        this.lastVolume = this.audio.volume;
        this.audio.volume = 0;
        volumeSlider.value = 0;
      } else {
        this.audio.volume = this.lastVolume || 1;
        volumeSlider.value = (this.lastVolume || 1) * 100;
      }
      this.updateVolumeIcon(this.audio.volume);
    });
  }

  updateVolumeIcon(volume) {
    const volumeIcon = document.getElementById('volumeIcon');
    if (volume === 0) {
      volumeIcon.className = 'fas fa-volume-mute';
    } else if (volume < 0.5) {
      volumeIcon.className = 'fas fa-volume-down';
    } else {
      volumeIcon.className = 'fas fa-volume-up';
    }
  }
}

// Initialize the music player
const player = new MusicPlayer();