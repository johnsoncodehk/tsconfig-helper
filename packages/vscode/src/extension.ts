import type { InitializationOptions } from '@tsconfig-helper/language-server';
import * as protocol from '@volar/language-server/protocol';
import { ExportsInfoForLabs, middleware, supportLabsVersion } from '@volar/vscode';
import * as path from 'path';
import * as vscode from 'vscode';
import * as lsp from 'vscode-languageclient/node';

let client: lsp.BaseLanguageClient;

export function activate(context: vscode.ExtensionContext) {

	if (!vscode.workspace.getConfiguration('editor').get<boolean>('codeLens')) {
		vscode.window.showInformationMessage('Please enable "editor.codeLens" to use TSConfig Helper.');
	}

	context.subscriptions.push(vscode.commands.registerCommand("tsconfig-helper.showReferences", async (...args: any) => {

		// https://github.com/microsoft/vscode/blob/70627146825d91fd61a9e00fb6fe75b9f01dbff1/extensions/markdown-language-features/src/languageFeatures/fileReferences.ts#L35-L43
		const config = vscode.workspace.getConfiguration('references');
		const existingSetting = config.inspect<string>('preferredLocation');

		await config.update('preferredLocation', 'view');
		try {
			await vscode.commands.executeCommand('editor.action.showReferences', ...args);
		} finally {
			await config.update('preferredLocation', existingSetting?.workspaceFolderValue ?? existingSetting?.workspaceValue);
		}
	}));

	const extraFileExtensions: string[] = [];

	if (vscode.extensions.getExtension('Vue.volar')) {
		extraFileExtensions.push('vue');
	}
	if (vscode.extensions.getExtension('astro-build.astro-vscode')) {
		extraFileExtensions.push('astro');
	}
	if (vscode.extensions.getExtension('svelte.svelte-vscode')) {
		extraFileExtensions.push('svelte');
	}

	client = new lsp.LanguageClient(
		'tsconfig-helper-language-server',
		'TSConfig Helper',
		{
			module: vscode.Uri.joinPath(context.extensionUri, 'server.js').fsPath,
			transport: lsp.TransportKind.ipc,
			options: { execArgv: [] },
		},
		{
			documentSelector: [
				{ language: 'jsonc', pattern: '**/tsconfig.json' },
				{ language: 'jsonc', pattern: '**/tsconfig.*.json' },
				{ language: 'jsonc', pattern: '**/tsconfig-*.json' },
			],
			initializationOptions: {
				typescript: {
					tsdk: path.join(vscode.env.appRoot, 'extensions/node_modules/typescript/lib'),
				},
				tsconfigHelper: {
					extraFileExtensions,
				},
			} satisfies InitializationOptions,
			middleware: {
				...middleware,
				async resolveCodeLens(codeLens, token, next) {
					codeLens = await middleware.resolveCodeLens?.(codeLens, token, next) ?? codeLens;
					if (codeLens.command?.command === 'editor.action.showReferences') {
						codeLens.command.command = 'tsconfig-helper.showReferences';
					}
					return codeLens;
				},
			},
		},
	);
	client.start();

	return {
		volarLabs: {
			version: supportLabsVersion,
			languageClients: [client],
			languageServerProtocol: protocol,
		}
	} satisfies ExportsInfoForLabs;
}

export function deactivate(): Thenable<any> | undefined {
	return client?.stop();
}
