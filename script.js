(() => {
  'use strict';

  const BLUE = 'rgb(0, 0, 254)';
  const $ = (id) => document.getElementById(id);
  const elements = {
    leftRail: $('left-rail'),
    rightRail: $('right-rail'),
    fileInput: $('file-input'),
    sourceFrame: $('source-frame'),
    sourceHint: $('source-hint'),
    sourceImage: $('source-image'),
    sourceVideo: $('source-video'),
    resultHint: $('result-hint'),
    resultImage: $('result-image'),
    resultVideo: $('result-video'),
    uploadButton: $('upload-button'),
    processButton: $('process-button'),
    downloadButton: $('download-button'),
    status: $('status'),
    sideButtons: Array.from(document.querySelectorAll('.side-button'))
  };

  const state = {
    file: null,
    kind: null,
    sides: new Set(['bottom']),
    railSide: 'left',
    railAnimating: false,
    sourceUrl: null,
    resultUrl: null,
    resultBlob: null,
    outputName: '',
    image: null,
    activeJob: 0,
    working: false,
    video: null
  };

  function setStatus(message, status = '') {
    elements.status.textContent = message;
    elements.status.dataset.state = status;
  }

  function clearResult() {
    if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
    state.resultUrl = null;
    state.resultBlob = null;
    state.outputName = '';
    elements.resultImage.hidden = true;
    elements.resultVideo.pause();
    elements.resultVideo.removeAttribute('src');
    elements.resultVideo.load();
    elements.resultVideo.hidden = true;
    elements.resultHint.hidden = false;
    elements.downloadButton.disabled = true;
  }

  function resetSource() {
    if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
    state.sourceUrl = null;
    state.image = null;
    elements.sourceImage.hidden = true;
    elements.sourceVideo.pause();
    elements.sourceVideo.removeAttribute('src');
    elements.sourceVideo.load();
    elements.sourceVideo.hidden = true;
    elements.sourceHint.hidden = false;
  }

  function detectKind(file) {
    const name = file.name.toLowerCase();
    if (file.type === 'image/gif' || name.endsWith('.gif')) return 'gif';
    if (file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogv|ogg)$/i.test(name)) return 'video';
    if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|avif)$/i.test(name)) return 'image';
    return null;
  }

  function updateSource(file, job) {
    state.sourceUrl = URL.createObjectURL(file);
    elements.sourceHint.hidden = true;
    if (state.kind === 'video') {
      const video = elements.sourceVideo;
      video.src = state.sourceUrl;
      video.hidden = false;
      video.onloadedmetadata = () => {
        if (job !== state.activeJob) return;
        if (!video.videoWidth || !video.videoHeight) {
          setStatus('Не удалось прочитать размеры видео.', 'error');
          return;
        }
        setStatus(`Видео загружено: ${video.videoWidth} × ${video.videoHeight}.`);
      };
      video.onerror = () => {
        if (job === state.activeJob) setStatus('Не удалось открыть видео. Попробуйте другой файл или формат.', 'error');
      };
      video.load();
      return;
    }
    const image = new Image();
    image.onload = () => {
      if (job !== state.activeJob) return;
      state.image = image;
      elements.sourceImage.src = state.sourceUrl;
      elements.sourceImage.hidden = false;
      setStatus(`${state.kind === 'gif' ? 'GIF' : 'Изображение'} загружено: ${image.naturalWidth} × ${image.naturalHeight}.`);
    };
    image.onerror = () => {
      if (job === state.activeJob) setStatus('Не удалось открыть изображение.', 'error');
    };
    image.src = state.sourceUrl;
  }

  function acceptFile(file) {
    if (!file) return;
    const kind = detectKind(file);
    if (!kind) {
      setStatus('Поддерживаются изображения, GIF и видео.', 'error');
      return;
    }
    state.activeJob++;
    state.working = false;
    state.file = file;
    state.kind = kind;
    state.image = null;
    elements.processButton.disabled = false;
    elements.processButton.setAttribute('aria-busy', 'false');
    clearResult();
    resetSource();
    setStatus('Загружаю файл…', 'working');
    updateSource(file, state.activeJob);
  }

  function drawOverlay(context, width, height) {
    context.fillStyle = BLUE;
    if (state.sides.has('bottom')) context.fillRect(0, height * 0.78, width, height * 0.22);
    if (state.sides.has('top')) context.fillRect(0, 0, width, height * 0.22);
    if (state.sides.has('left')) context.fillRect(0, 0, width * 0.22, height);
    if (state.sides.has('right')) context.fillRect(width * 0.78, 0, width * 0.22, height);
  }

  function canvasBlob(canvas, type = 'image/png', quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Браузер не смог экспортировать изображение.')), type, quality);
    });
  }

  function baseName(file) {
    return file.name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_') || 'media';
  }

  function publishResult(blob, extension, job) {
    if (job !== state.activeJob) return;
    clearResult();
    state.resultBlob = blob;
    state.outputName = `exosuitized_${baseName(state.file)}.${extension}`;
    state.resultUrl = URL.createObjectURL(blob);
    elements.resultHint.hidden = true;
    if (blob.type.startsWith('video/')) {
      elements.resultVideo.src = state.resultUrl;
      elements.resultVideo.hidden = false;
      elements.resultVideo.load();
    } else {
      elements.resultImage.src = state.resultUrl;
      elements.resultImage.alt = state.kind === 'gif' ? 'Обработанный анимированный GIF' : 'Обработанное изображение';
      elements.resultImage.hidden = false;
    }
    elements.downloadButton.disabled = false;
    setStatus('Готово! Результат можно скачать.', '');
  }

  async function processImage(job) {
    if (!state.image) throw new Error('Изображение ещё загружается. Подождите немного и повторите.');
    const canvas = document.createElement('canvas');
    canvas.width = state.image.naturalWidth;
    canvas.height = state.image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas недоступен в этом браузере.');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(state.image, 0, 0);
    drawOverlay(context, canvas.width, canvas.height);
    const blob = await canvasBlob(canvas);
    publishResult(blob, 'png', job);
  }

  function decodeGifFrames(file, job) {
    return file.arrayBuffer().then((buffer) => {
      if (job !== state.activeJob) throw new Error('Обработка отменена.');
      if (!window.GifReader) throw new Error('Не загрузилась библиотека GIF (omggif). Проверьте подключение к интернету и обновите страницу.');
      const reader = new window.GifReader(new Uint8Array(buffer));
      const width = reader.width;
      const height = reader.height;
      if (!width || !height || !reader.numFrames()) throw new Error('GIF-файл не содержит кадров.');
      const composite = document.createElement('canvas');
      composite.width = width;
      composite.height = height;
      const context = composite.getContext('2d');
      const frames = [];
      const frameCanvas = document.createElement('canvas');
      frameCanvas.width = width;
      frameCanvas.height = height;
      const frameContext = frameCanvas.getContext('2d');
      for (let index = 0; index < reader.numFrames(); index++) {
        if (job !== state.activeJob) throw new Error('Обработка отменена.');
        const info = reader.frameInfo(index);
        const pixels = new Uint8ClampedArray(width * height * 4);
        reader.decodeAndBlitFrameRGBA(index, pixels);
        frameContext.clearRect(0, 0, width, height);
        frameContext.putImageData(new ImageData(pixels, width, height), 0, 0);
        context.drawImage(frameCanvas, 0, 0);
        drawOverlay(context, width, height);
        frames.push({ data: context.getImageData(0, 0, width, height), delay: Math.max(20, (info.delay || 10) * 10) });
        if (info.disposal === 2) context.clearRect(0, 0, width, height);
      }
      return { width, height, frames };
    });
  }

  function fetchGifWorker(job) {
    const urls = [
      'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js',
      'https://unpkg.com/gif.js@0.2.0/dist/gif.worker.js'
    ];
    return (async () => {
      let lastError;
      for (const url of urls) {
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const source = await response.text();
          if (!source) throw new Error('Пустой ответ worker');
          if (job !== state.activeJob) throw new Error('Обработка отменена.');
          return URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        } catch (error) { lastError = error; }
      }
      throw new Error(`Не удалось загрузить GIF worker: ${lastError ? lastError.message : 'нет ответа от CDN'}.`);
    })();
  }

  async function processGif(job) {
    if (!window.GIF) throw new Error('Не загрузилась библиотека GIF (gif.js). Проверьте подключение к интернету и обновите страницу.');
    setStatus('Разбираю кадры GIF…', 'working');
    const decoded = await decodeGifFrames(state.file, job);
    if (job !== state.activeJob) return;
    setStatus(`Собираю GIF: ${decoded.frames.length} кадров…`, 'working');
    const workerUrl = await fetchGifWorker(job);
    try {
      const transparentColor = { r: 255, g: 0, b: 255 };
      const encoder = new window.GIF({
        workers: 2,
        quality: 10,
        width: decoded.width,
        height: decoded.height,
        workerScript: workerUrl,
        background: '#ff00ff',
        transparent: 0xff00ff
      });
      decoded.frames.forEach((frame) => {
        for (let pixel = 0; pixel < frame.data.data.length; pixel += 4) {
          const data = frame.data.data;
          if (data[pixel + 3] < 128) {
            data[pixel] = transparentColor.r;
            data[pixel + 1] = transparentColor.g;
            data[pixel + 2] = transparentColor.b;
          }
          data[pixel + 3] = 255;
        }
        encoder.addFrame(frame.data, { delay: frame.delay, copy: true });
      });
      encoder.on('progress', (progress) => {
        if (job === state.activeJob) setStatus(`Собираю GIF: ${Math.round(progress * 100)}%`, 'working');
      });
      const blob = await new Promise((resolve, reject) => {
        encoder.on('finished', resolve);
        encoder.on('abort', () => reject(new Error('Сборка GIF прервана.')));
        try { encoder.render(); } catch (error) { reject(error); }
      });
      if (job === state.activeJob) publishResult(blob, 'gif', job);
    } finally {
      URL.revokeObjectURL(workerUrl);
    }
  }

  function waitForEvent(target, successEvent, errorMessage) {
    return new Promise((resolve, reject) => {
      const onSuccess = () => { cleanup(); resolve(); };
      const onError = () => { cleanup(); reject(new Error(errorMessage)); };
      const cleanup = () => {
        target.removeEventListener(successEvent, onSuccess);
        target.removeEventListener('error', onError);
      };
      target.addEventListener(successEvent, onSuccess, { once: true });
      target.addEventListener('error', onError, { once: true });
    });
  }

  function chooseVideoMime() {
    if (!window.MediaRecorder) return '';
    const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    return types.find((type) => MediaRecorder.isTypeSupported(type)) || '';
  }

  async function processVideo(job) {
    const input = elements.sourceVideo;
    if (!window.MediaRecorder || (!input.captureStream && !input.mozCaptureStream)) {
      throw new Error('Этот браузер не поддерживает запись обработанного видео (MediaRecorder/captureStream). Фото и GIF доступны.');
    }
    if (!input.videoWidth) await waitForEvent(input, 'loadedmetadata', 'Не удалось загрузить метаданные видео.');
    const width = input.videoWidth;
    const height = input.videoHeight;
    const mimeType = chooseVideoMime();
    if (!mimeType) throw new Error('Браузер не сообщает поддерживаемый видеоформат для MediaRecorder.');

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    const stream = canvas.captureStream(30);
    const sourceStream = (input.captureStream || input.mozCaptureStream).call(input);
    const audioTracks = sourceStream.getAudioTracks ? sourceStream.getAudioTracks() : [];
    audioTracks.forEach((track) => stream.addTrack(track));
    const chunks = [];
    let recorder;
    try { recorder = new MediaRecorder(stream, { mimeType }); }
    catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      sourceStream.getTracks().forEach((track) => track.stop());
      throw new Error(`Не удалось запустить MediaRecorder: ${error.message}`);
    }
    state.video = { recorder, stream, sourceStream };
    const completion = new Promise((resolve, reject) => {
      recorder.ondataavailable = (event) => { if (event.data && event.data.size) chunks.push(event.data); };
      recorder.onerror = () => reject(new Error('Ошибка при записи видео.'));
      recorder.onstop = () => resolve();
    });
    const paint = () => {
      if (job !== state.activeJob || recorder.state !== 'recording') return;
      context.clearRect(0, 0, width, height);
      context.drawImage(input, 0, 0, width, height);
      drawOverlay(context, width, height);
      const duration = input.duration;
      const progress = Number.isFinite(duration) && duration > 0 ? Math.min(100, Math.round(input.currentTime / duration * 100)) : 0;
      setStatus(`Обрабатываю видео: ${progress}%`, 'working');
    };
    try {
      input.pause();
      input.currentTime = 0;
      if (input.readyState < 2) await waitForEvent(input, 'loadeddata', 'Не удалось декодировать первый кадр видео.');
      paint();
      recorder.start(250);
      await input.play();
      await new Promise((resolve, reject) => {
        const stop = () => { if (recorder.state !== 'inactive') recorder.stop(); resolve(); };
        input.addEventListener('ended', stop, { once: true });
        input.addEventListener('error', () => reject(new Error('Ошибка воспроизведения видео.')), { once: true });
        const tick = () => {
          if (job !== state.activeJob) { stop(); return; }
          if (recorder.state !== 'recording') return;
          paint();
          if (typeof input.requestVideoFrameCallback === 'function') input.requestVideoFrameCallback(tick);
          else setTimeout(tick, 33);
        };
        if (typeof input.requestVideoFrameCallback === 'function') input.requestVideoFrameCallback(tick);
        else setTimeout(tick, 33);
        if (input.ended) stop();
      });
      await completion;
      if (job !== state.activeJob) return;
      if (!chunks.length) throw new Error('Запись завершилась без данных. Попробуйте другой формат видео.');
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
      publishResult(blob, blob.type.includes('mp4') ? 'mp4' : 'webm', job);
    } finally {
      input.pause();
      stream.getTracks().forEach((track) => track.stop());
      sourceStream.getTracks().forEach((track) => track.stop());
      state.video = null;
    }
  }

  async function processCurrent() {
    if (!state.file || state.working) return;
    state.activeJob++;
    const job = state.activeJob;
    state.working = true;
    clearResult();
    elements.processButton.disabled = true;
    elements.processButton.setAttribute('aria-busy', 'true');
    setStatus('Обрабатываю…', 'working');
    try {
      if (state.kind === 'image') await processImage(job);
      else if (state.kind === 'gif') await processGif(job);
      else await processVideo(job);
    } catch (error) {
      if (job === state.activeJob) {
        clearResult();
        setStatus(error && error.message ? error.message : 'Произошла ошибка при обработке.', 'error');
      }
    } finally {
      if (job === state.activeJob) {
        state.working = false;
        elements.processButton.disabled = !state.file;
        elements.processButton.setAttribute('aria-busy', 'false');
      }
    }
  }

  function setSide(button) {
    const side = button.dataset.side;
    const checkbox = button.querySelector('.side-checkbox');
    const willSelect = !state.sides.has(side);
    if (willSelect) state.sides.add(side);
    else state.sides.delete(side);
    if (checkbox) checkbox.checked = willSelect;
    button.classList.toggle('is-selected', willSelect);
    button.setAttribute('aria-pressed', String(willSelect));
    if (state.resultBlob && !state.working) processCurrent();
  }

  function toggleRail(event) {
    if (state.railAnimating) return;
    const requestedSide = event.currentTarget === elements.leftRail ? 'right' : 'left';
    if (requestedSide === state.railSide) return;
    state.railAnimating = true;
    state.railSide = requestedSide;
    document.body.classList.toggle('rail-right', requestedSide === 'right');
    document.body.dataset.railSide = requestedSide;
    elements.leftRail.setAttribute('aria-pressed', String(requestedSide === 'left'));
    elements.rightRail.setAttribute('aria-pressed', String(requestedSide === 'right'));
    elements.leftRail.setAttribute('aria-label', requestedSide === 'left' ? 'Переместить синюю полосу вправо' : 'Синяя полоса слева');
    elements.rightRail.setAttribute('aria-label', requestedSide === 'right' ? 'Переместить синюю полосу влево' : 'Синяя полоса справа');
    elements.leftRail.tabIndex = requestedSide === 'left' ? 0 : -1;
    elements.rightRail.tabIndex = requestedSide === 'right' ? 0 : -1;
    window.setTimeout(() => { state.railAnimating = false; }, 560);
  }

  function downloadResult() {
    if (!state.resultBlob) return;
    const url = URL.createObjectURL(state.resultBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = state.outputName;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  elements.leftRail.addEventListener('click', toggleRail);
  elements.rightRail.addEventListener('click', toggleRail);
  elements.uploadButton.addEventListener('click', () => elements.fileInput.click());
  elements.sourceFrame.addEventListener('click', () => elements.fileInput.click());
  elements.fileInput.addEventListener('change', (event) => {
    acceptFile(event.target.files && event.target.files[0]);
    event.target.value = '';
  });
  elements.processButton.addEventListener('click', processCurrent);
  elements.downloadButton.addEventListener('click', downloadResult);
  elements.sideButtons.forEach((button) => button.addEventListener('click', () => setSide(button)));
  ['dragenter', 'dragover'].forEach((eventName) => elements.sourceFrame.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.sourceFrame.classList.add('drag-over');
  }));
  ['dragleave', 'drop'].forEach((eventName) => elements.sourceFrame.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.sourceFrame.classList.remove('drag-over');
  }));
  elements.sourceFrame.addEventListener('drop', (event) => {
    const file = event.dataTransfer && event.dataTransfer.files[0];
    if (file) acceptFile(file);
  });
  window.addEventListener('beforeunload', () => {
    state.activeJob++;
    if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
    if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
    if (state.video) {
      try { if (state.video.recorder.state !== 'inactive') state.video.recorder.stop(); } catch (_) {}
      state.video.stream.getTracks().forEach((track) => track.stop());
      state.video.sourceStream.getTracks().forEach((track) => track.stop());
    }
  });
})();
