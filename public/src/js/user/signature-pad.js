// Signature pad functionality
class SignaturePad {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.isDrawing = false;
    this.lastX = 0;
    this.lastY = 0;
    this.hasSignature = false;
  }

  init() {
    this.canvas = document.getElementById('signature-pad');
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    this.setupCanvas();
    this.setupEventListeners();
    this.setupButtons();
  }

  setupCanvas() {
    // Set canvas size
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;

    // Set drawing style
    this.ctx.strokeStyle = '#000';
    this.ctx.lineWidth = 2;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    // Handle high DPI displays
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
  }

  setupEventListeners() {
    // Mouse events
    this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
    this.canvas.addEventListener('mousemove', (e) => this.draw(e));
    this.canvas.addEventListener('mouseup', () => this.stopDrawing());
    this.canvas.addEventListener('mouseout', () => this.stopDrawing());

    // Touch events
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.startDrawing(e.touches[0]);
    });
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      this.draw(e.touches[0]);
    });
    this.canvas.addEventListener('touchend', () => this.stopDrawing());
  }

  setupButtons() {
    const clearBtn = document.getElementById('clearSignatureBtn');
    const confirmBtn = document.getElementById('confirmSignatureBtn');

    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clear());
    }

    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => this.confirm());
    }
  }

  getCoordinates(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  startDrawing(event) {
    this.isDrawing = true;
    const coords = this.getCoordinates(event);
    this.lastX = coords.x;
    this.lastY = coords.y;
  }

  draw(event) {
    if (!this.isDrawing) return;

    const coords = this.getCoordinates(event);
    
    this.ctx.beginPath();
    this.ctx.moveTo(this.lastX, this.lastY);
    this.ctx.lineTo(coords.x, coords.y);
    this.ctx.stroke();
    
    this.lastX = coords.x;
    this.lastY = coords.y;
    this.hasSignature = true;
  }

  stopDrawing() {
    this.isDrawing = false;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.hasSignature = false;
    
    if (pageEntry) {
      pageEntry.clearSignatureData();
    }
  }

  confirm() {
    if (!this.hasSignature) {
      alert('Please sign before confirming');
      return;
    }

    const dataUrl = this.canvas.toDataURL('image/png');
    
    if (pageEntry) {
      pageEntry.setSignatureData(dataUrl);
    }
  }

  isEmpty() {
    return !this.hasSignature;
  }
}

const signaturePad = new SignaturePad();