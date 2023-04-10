import { InitializationOptions } from '@tsconfig-helper/language-server';
import { middleware } from '@volar/vscode';
import * as vscode from 'vscode';
import * as lsp from 'vscode-languageclient/node';
import * as path from 'path';

let client: lsp.BaseLanguageClient;

export function activate(context: vscode.ExtensionContext) {

	context.subscriptions.push(vscode.commands.registerCommand("tsconfig-helper.showReferences", async (...args: any) => {

		const config = vscode.workspace.getConfiguration('references');
		const existingSetting = config.get('preferredLocation', undefined);

		await config.update('preferredLocation', 'view');
		try {
			await vscode.commands.executeCommand(
				'editor.action.showReferences',
				...args,
			);
		} finally {
			await config.update('preferredLocation', existingSetting);
		}
	}));

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
					extraFileExtensions: vscode.workspace.getConfiguration('tsconfig-helper').get<string[]>('extraFileExtensions') ?? [],
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
	return client.start();
}

export function deactivate(): Thenable<any> | undefined {
	return client?.stop();
}
