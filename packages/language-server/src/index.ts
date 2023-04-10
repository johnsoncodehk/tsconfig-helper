import { LanguageServerInitializationOptions } from '@volar/language-server/node';

export interface InitializationOptions extends LanguageServerInitializationOptions {
    tsconfigHelper?: {
        extraFileExtensions?: string[];
    };
}
