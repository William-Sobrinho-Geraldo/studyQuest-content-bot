import { randomUUID } from 'node:crypto';
import {
  access,
  copyFile,
  mkdir,
  readdir,
  readFile,
  rename,
  unlink,
} from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type ContentAssetType = 'posts' | 'reels' | 'stories';
export type ContentAssetKind = 'image' | 'video';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm']);

const CONTENT_EXTENSIONS_BY_TYPE: Record<ContentAssetType, Set<string>> = {
  posts: IMAGE_EXTENSIONS,
  reels: new Set([...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS]),
  stories: IMAGE_EXTENSIONS,
};

const NATURAL_FILE_NAME_COLLATOR = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
});

const MIME_TYPES_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.webm': 'video/webm',
};

export interface SelectedContentAsset {
  sourceFileName: string;
  fileName: string;
  filePath: string;
  publicPath: string;
  publicUrl: string;
  mimeType: string;
  kind: ContentAssetKind;
  base64?: string;
  dataUri?: string;
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly contentDir = resolve(
    process.env.CONTENT_ASSETS_DIR?.trim() ||
      join(process.cwd(), 'src', 'assets', 'content'),
  );
  private readonly generatedDir = resolve(
    process.env.GENERATED_IMAGES_DIR?.trim() ||
      join(process.cwd(), 'public', 'generated'),
  );
  private selectionQueue: Promise<unknown> = Promise.resolve();

  constructor(private readonly configService: ConfigService) {}

  async selectNextContentAsset(
    type: ContentAssetType,
  ): Promise<SelectedContentAsset> {
    const allowedExtensions = CONTENT_EXTENSIONS_BY_TYPE[type];

    if (!allowedExtensions) {
      throw new BadRequestException(
        `Unsupported content asset type: ${type}. Use posts, reels or stories.`,
      );
    }

    return this.runExclusive(async () => {
      try {
        return await this.selectAndConsumeContentAsset(
          type,
          allowedExtensions,
        );
      } catch (error) {
        if (error instanceof HttpException) {
          throw error;
        }

        this.logger.error(
          `Failed to select local content asset from "${type}": ${this.getErrorMessage(error)}`,
        );

        throw new ServiceUnavailableException(
          `Falha ao selecionar asset local da pasta ${type}: ${this.getErrorMessage(error)}`,
        );
      }
    });
  }

  private async selectAndConsumeContentAsset(
    type: ContentAssetType,
    allowedExtensions: Set<string>,
  ): Promise<SelectedContentAsset> {
    const typeDir = join(this.contentDir, type);

    await mkdir(typeDir, { recursive: true });

    const sourceFileName = await this.findNextEligibleContentFile(
      typeDir,
      allowedExtensions,
    );

    if (!sourceFileName) {
      throw new ServiceUnavailableException(
        `Estoque esgotado na pasta ${type}. Adicione novos arquivos em src/assets/content/${type}`,
      );
    }

    const sourcePath = join(typeDir, sourceFileName);
    const extension = extname(sourceFileName).toLowerCase();
    const mimeType = MIME_TYPES_BY_EXTENSION[extension] ?? 'image/png';
    const kind = this.getAssetKind(extension);
    const usedFileName = await this.buildUsedFileName(
      typeDir,
      sourceFileName,
      extension,
    );
    const usedFilePath = join(typeDir, usedFileName);
    const publicFileName = `studyquest-${type}-${Date.now()}-${randomUUID().slice(0, 8)}${extension}`;
    const publicFilePath = join(this.generatedDir, publicFileName);
    const base64 =
      kind === 'image'
        ? (await readFile(sourcePath)).toString('base64')
        : undefined;

    await mkdir(this.generatedDir, { recursive: true });
    await copyFile(sourcePath, publicFilePath);

    try {
      await rename(sourcePath, usedFilePath);
    } catch (error) {
      await unlink(publicFilePath).catch(() => undefined);

      throw new ServiceUnavailableException(
        `Falha ao marcar o arquivo "${sourceFileName}" de ${type} como utilizado: ${this.getErrorMessage(error)}`,
      );
    }

    const publicPath = `/public/generated/${publicFileName}`;

    this.logger.log(
      `Local ${kind} asset "${sourceFileName}" selected from "${type}" and marked as "${usedFileName}": ${publicPath}`,
    );

    return {
      sourceFileName,
      fileName: publicFileName,
      filePath: publicFilePath,
      publicPath,
      publicUrl: `${this.getPublicBaseUrl()}${publicPath}`,
      mimeType,
      kind,
      base64,
      dataUri: base64 ? `data:${mimeType};base64,${base64}` : undefined,
    };
  }

  private async findNextEligibleContentFile(
    typeDir: string,
    allowedExtensions: Set<string>,
  ): Promise<string | null> {
    const entries = await readdir(typeDir, { withFileTypes: true });
    const eligibleFiles = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((fileName) =>
        allowedExtensions.has(extname(fileName).toLowerCase()),
      )
      .filter((fileName) => !fileName.toLowerCase().includes('_used'))
      .sort(NATURAL_FILE_NAME_COLLATOR.compare);

    return eligibleFiles[0] ?? null;
  }

  private async buildUsedFileName(
    typeDir: string,
    sourceFileName: string,
    extension: string,
  ): Promise<string> {
    const baseName = sourceFileName.slice(
      0,
      sourceFileName.length - extname(sourceFileName).length,
    );
    let candidate = `${baseName}_used${extension}`;
    let counter = 2;

    while (await this.pathExists(join(typeDir, candidate))) {
      candidate = `${baseName}_used_${counter}${extension}`;
      counter += 1;
    }

    return candidate;
  }

  private getAssetKind(extension: string): ContentAssetKind {
    return VIDEO_EXTENSIONS.has(extension) ? 'video' : 'image';
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await access(path);

      return true;
    } catch {
      return false;
    }
  }

  private runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const result = this.selectionQueue.then(
      () => task(),
      () => task(),
    );

    this.selectionQueue = result.then(
      () => undefined,
      () => undefined,
    );

    return result;
  }

  private getPublicBaseUrl(): string {
    const configured = this.configService
      .get<string>('PUBLIC_MEDIA_BASE_URL')
      ?.trim();

    if (configured) {
      return configured.replace(/\/+$/, '');
    }

    return `http://localhost:${process.env.PORT ?? 3000}`;
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
