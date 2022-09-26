import * as vscode from 'vscode';
import { CodelensProvider } from './CodelensProvider';

let disposables: vscode.Disposable[] = [];

export function activate(context: vscode.ExtensionContext) {

	const codelensProvider = new CodelensProvider();

	disposables.push(vscode.languages.registerCodeLensProvider([
		{ language: 'jsonc', pattern: '**/tsconfig.json' },
		{ language: 'jsonc', pattern: '**/tsconfig.*.json' },
		{ language: 'jsonc', pattern: '**/tsconfig-*.json' },
	], codelensProvider));

	disposables.push(vscode.commands.registerCommand("tsconfig-helper.showReferences", async (uri: vscode.Uri, position: vscode.Position, fileNames: string[]) => {

		const config = vscode.workspace.getConfiguration('references');
		const existingSetting = config.get('preferredLocation', undefined);

		await config.update('preferredLocation', 'view');
		try {
			await vscode.commands.executeCommand(
				'editor.action.showReferences',
				uri,
				position,
				fileNames.map(fileName => new vscode.Location(
					vscode.Uri.file(fileName),
					new vscode.Range(0, 0, 0, 0),
				)),
			);
		} finally {
			await config.update('preferredLocation', existingSetting);
		}
	}));
}

export function deactivate() {
	if (disposables) {
		disposables.forEach(item => item.dispose());
	}
	disposables = [];
}
