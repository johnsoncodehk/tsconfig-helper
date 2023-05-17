import { InitializationOptions as _InitializationOptions } from '@volar/language-server/node';

export interface InitializationOptions extends _InitializationOptions {
    tsconfigHelper?: {
        extraFileExtensions?: string[];
    };
}

export * as protocol from '@volar/language-server/protocol';
