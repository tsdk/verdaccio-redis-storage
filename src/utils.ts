import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { Logger } from '@verdaccio/types';
import { default as Redis, RedisOptions } from "ioredis";
import { VerdaccioError, getInternalError } from '@verdaccio/commons-api';
import YAML from 'js-yaml';

export function redisCreateClient(config: string | RedisOptions, logger: Logger): Redis {
  const client = new Redis(config as any);
  client.on('connect', function () {
    logger.warn('[verdaccio/redis] connected to redis server');
  });

  client.on("ready", function () {
    logger.warn("[verdaccio/redis] ready to use");
    logger.warn("[verdaccio/redis] set enableOfflineQueue to false to make following web requests fail instantly when redis connection is down");
    client.options.enableOfflineQueue = false;
  });

  client.on('reconnecting', function (delay) {
    logger.warn({ delay }, '[verdaccio/redis] reconnecting in @{delay}ms');
  });

  client.on('end', function () {
    logger.warn('[verdaccio/redis] redis connection end');
  });

  client.on('close', function () {
    logger.warn('[verdaccio/redis] redis connection close');
  });

  client.on('error', function (err) {
    logger.error({ err }, '[verdaccio/redis] redis error @{err}');
  });

  return client;
}

export const REDIS_PREFIX = 've:';
export const TEST_REDIS_PREFIX = 'testve:';

function prefix(key: string): string {
  const prefix = process.env.NODE_ENV === 'test' ? TEST_REDIS_PREFIX : REDIS_PREFIX;
  return prefix + key;
}

export const REDIS_KEY = {
  secret: prefix('secret'),
  packages: prefix('pkgs'),
  package: prefix('pkg:'),
  token: prefix('token:'),
};

export const REDIS_FIELD = {
  stat: 'stat',
};

export const VERDACCIO_DB_FILE = '.verdaccio-db.json';

export const PACKAGE_JSON_FILE = 'package.json';

/**
 * Wrap an generic error to a verdaccio error
 *
 * @param error
 */
export function wrapError(err: unknown): VerdaccioError {
  const obj = err as any;
  if ('code' in obj && 'message' in obj)
    return err as VerdaccioError;
  else if ('message' in obj)
    return getInternalError((obj as Error).message);
  else
    return getInternalError(String(err));
 }

/**
 * Load verdaccio config file
 * @param configPath
 */
export function parseConfigFile(configPath: string): any {
  try {
    const absPath = path.resolve(configPath);
    if (/\.ya?ml$/i.test(absPath)) {
      return YAML.load(fs.readFileSync(absPath, 'utf8'));
    }
    return require(absPath);
  } catch (err) {
    const error = wrapError(err) as any;
    if (error.code !== 'MODULE_NOT_FOUND') {
      error.message = 'failed to load verdaccio configuration file.';
    }
    throw error;
  }
}

/**
 * Convert buffer stream to base64 string
 */
export function bufferStreamToBase64String(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  return new Promise(function (resolve, reject) {
    stream.on('data', function (chunk) {
      chunks.push(chunk as Buffer);
    });
    stream.on('end', function () {
      const buf = Buffer.concat(chunks);
      const data = buf.toString('base64');
      resolve(data);
    });
    stream.on('error', function (err) {
      reject(err);
    });
  });
}
