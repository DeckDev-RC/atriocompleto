/**
 * Compressão de imagem client-side usando Canvas API.
 * Redimensiona e converte para JPEG com qualidade decrescente
 * até que o arquivo fique abaixo do tamanho alvo.
 *
 * Nenhuma dependência externa necessária.
 */

interface CompressOptions {
  /** Tamanho máximo em MB (padrão: 1.5) */
  maxSizeMB?: number;
  /** Dimensão máxima (largura ou altura) em px (padrão: 800) */
  maxDimension?: number;
  /** Qualidade inicial JPEG 0-1 (padrão: 0.85) */
  initialQuality?: number;
}

const DEFAULTS: Required<CompressOptions> = {
  maxSizeMB: 1.5,
  maxDimension: 800,
  initialQuality: 0.85,
};

/**
 * Carrega um File como HTMLImageElement.
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Falha ao carregar imagem'));
    };

    img.src = url;
  });
}

/**
 * Calcula dimensões mantendo aspect ratio dentro do limite.
 */
function fitDimensions(
  width: number,
  height: number,
  maxDim: number,
): { w: number; h: number } {
  if (width <= maxDim && height <= maxDim) {
    return { w: width, h: height };
  }
  const ratio = Math.min(maxDim / width, maxDim / height);
  return {
    w: Math.round(width * ratio),
    h: Math.round(height * ratio),
  };
}

/**
 * Desenha a imagem no canvas e exporta como Blob JPEG com a qualidade dada.
 */
function canvasToBlob(
  img: HTMLImageElement,
  w: number,
  h: number,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Canvas 2D não suportado'));
      return;
    }

    ctx.drawImage(img, 0, 0, w, h);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Falha ao gerar blob'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      quality,
    );
  });
}

/**
 * Comprime uma imagem para caber dentro do tamanho alvo.
 *
 * Fluxo:
 * 1. Se o arquivo já está abaixo do limite, retorna sem alterar.
 * 2. Redimensiona para maxDimension mantendo aspect ratio.
 * 3. Exporta como JPEG reduzindo qualidade iterativamente até caber.
 *
 * @returns File comprimido (sempre JPEG)
 */
export async function compressImage(
  file: File,
  options: CompressOptions = {},
): Promise<File> {
  const { maxSizeMB, maxDimension, initialQuality } = { ...DEFAULTS, ...options };
  const targetBytes = maxSizeMB * 1024 * 1024;

  // Já está dentro do limite e é JPEG — retorna como está
  if (file.size <= targetBytes && file.type === 'image/jpeg') {
    return file;
  }

  const img = await loadImage(file);
  const { w, h } = fitDimensions(img.naturalWidth, img.naturalHeight, maxDimension);

  // Tenta qualidades decrescentes até caber
  const MIN_QUALITY = 0.1;
  const QUALITY_STEP = 0.1;
  let quality = initialQuality;

  while (quality >= MIN_QUALITY) {
    const blob = await canvasToBlob(img, w, h, quality);

    if (blob.size <= targetBytes || quality <= MIN_QUALITY) {
      // Gera nome com extensão .jpg
      const baseName = file.name.replace(/\.[^.]+$/, '');
      return new File([blob], `${baseName}.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });
    }

    quality -= QUALITY_STEP;
  }

  // Fallback: retorna última tentativa (qualidade mínima)
  const blob = await canvasToBlob(img, w, h, MIN_QUALITY);
  const baseName = file.name.replace(/\.[^.]+$/, '');
  return new File([blob], `${baseName}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}
