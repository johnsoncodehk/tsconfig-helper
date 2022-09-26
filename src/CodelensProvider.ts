import * as jsonc from 'jsonc-parser';
import * as path from 'path';
import * as vscode from 'vscode';
import { ts } from './typescript';
import type { FileExtensionInfo } from 'typescript';

const codeLensData = new WeakMap<vscode.CodeLens, {
	uri: vscode.Uri,
	position: vscode.Position,
	getFileNames(): string[],
}>();

export class CodelensProvider implements vscode.CodeLensProvider {

	private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
	public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

	constructor() {
		vscode.workspace.onDidChangeTextDocument(e => {
			if (e.document === this._document) {
				this._onDidChangeCodeLenses.fire();
			}
		});
		vscode.workspace.onDidChangeConfiguration(e => {
			this._onDidChangeCodeLenses.fire();
		});
	}

	private _document: vscode.TextDocument | undefined;

	public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {

		this._document = document;

		const extraFileExtensions: FileExtensionInfo[] = [];

		if (vscode.workspace.getConfiguration('tsconfig-helper').get('extraFileExtensions.vue')) {
			extraFileExtensions.push({
				extension: 'vue',
				isMixedContent: true,
				scriptKind: ts.ScriptKind.Deferred,
			});
		}

		if (vscode.workspace.getConfiguration('tsconfig-helper').get('extraFileExtensions.html')) {
			extraFileExtensions.push({
				extension: 'html',
				isMixedContent: true,
				scriptKind: ts.ScriptKind.JS,
			});
		}

		const codeLenses: vscode.CodeLens[] = [];
		const ast = jsonc.parseTree(document.getText());
		const jsonObj = jsonc.parse(document.getText());
		const readFile = (path: string) => {
			if (path === document.fileName) {
				return document.getText();
			}
			return ts.sys.readFile(path);
		};

		if (ast) {
			const start = document.positionAt(ast.offset);
			const end = document.positionAt(ast.offset + ast.length);
			const range = new vscode.Range(start, end);
			const codeLens = new vscode.CodeLens(range);
			codeLensData.set(codeLens, {
				uri: document.uri,
				position: start,
				getFileNames() {
					const jsonConfigFile = ts.readJsonConfigFile(document.fileName, readFile);
					const content = ts.parseJsonSourceFileConfigFileContent(jsonConfigFile, ts.sys, path.dirname(document.fileName), undefined, document.fileName, undefined, extraFileExtensions);
					return content.fileNames;
				},
			});
			codeLenses.push(codeLens);
		}

		for (const [option, options] of [
			// extends
			[ast?.children?.find(p => p.type === 'property' && p.children?.[0].value === 'extends'), { extends: jsonObj.extends }] as const,
			// files
			[ast?.children?.find(p => p.type === 'property' && p.children?.[0].value === 'files' && p.children[1].type === 'array'), { files: jsonObj.files, compilerOptions: jsonObj.compilerOptions }] as const,
		]) {
			if (!option) continue;
			const start = document.positionAt(option.offset);
			const end = document.positionAt(option.offset + option.length);
			const range = new vscode.Range(start, end);
			const codeLens = new vscode.CodeLens(range);
			codeLensData.set(codeLens, {
				uri: document.uri,
				position: start,
				getFileNames() {
					const content = ts.parseJsonConfigFileContent(options, ts.sys, path.dirname(document.fileName), undefined, document.fileName, undefined, extraFileExtensions);
					return content.fileNames;
				},
			});
			codeLenses.push(codeLens);
		}

		for (const includeValueNode of [
			// include
			ast?.children?.find(p => p.type === 'property' && p.children?.[0].value === 'include' && p.children[1].type === 'array')?.children?.[1],
			// paths
			...(
				ast?.children?.find(p => p.type === 'property' && p.children?.[0].value === 'compilerOptions' && p.children[1].type === 'object')?.children?.[1]
					?.children?.find(p => p.type === 'property' && p.children?.[0].value === 'paths' && p.children[1].type === 'object')?.children?.[1]
					.children?.map(child => child.children?.[1])
				?? []
			),
		]) {
			if (!includeValueNode?.children) continue;
			for (const pathNode of includeValueNode.children) {
				if (pathNode.type === 'string' && pathNode.value) {
					const start = document.positionAt(pathNode.offset);
					const end = document.positionAt(pathNode.offset + pathNode.length);
					const range = new vscode.Range(start, end);
					const codeLens = new vscode.CodeLens(range);
					codeLensData.set(codeLens, {
						uri: document.uri,
						position: start,
						getFileNames() {
							const content = ts.parseJsonConfigFileContent({ include: [pathNode.value], compilerOptions: jsonObj.compilerOptions }, ts.sys, path.dirname(document.fileName), undefined, document.fileName, undefined, extraFileExtensions);
							return content.fileNames;
						},
					});
					codeLenses.push(codeLens);
				}
			}
		}

		for (const excludeValueNode of [
			// exclude
			ast?.children?.find(p => p.type === 'property' && p.children?.[0].value === 'exclude' && p.children[1].type === 'array')?.children?.[1],
		]) {
			if (!excludeValueNode?.children) continue;
			for (const pathNode of excludeValueNode.children) {
				if (pathNode.type === 'string' && pathNode.value) {
					const start = document.positionAt(pathNode.offset);
					const end = document.positionAt(pathNode.offset + pathNode.length);
					const range = new vscode.Range(start, end);
					const codeLens = new vscode.CodeLens(range);
					codeLensData.set(codeLens, {
						uri: document.uri,
						position: start,
						getFileNames() {
							const originalConfig = ts.readJsonConfigFile(document.fileName, path => {
								if (path === document.fileName) {
									return document.getText().substring(0, excludeValueNode.offset)
										+ '[]'
										+ document.getText().substring(excludeValueNode.offset + excludeValueNode.length);
								}
								return readFile(path);
							});
							const excludeConfig = ts.readJsonConfigFile(document.fileName, path => {
								if (path === document.fileName) {
									return document.getText().substring(0, excludeValueNode.offset)
										+ `["${pathNode.value}"]`
										+ document.getText().substring(excludeValueNode.offset + excludeValueNode.length);
								}
								return readFile(path);
							});
							const originalContent = ts.parseJsonSourceFileConfigFileContent(originalConfig, ts.sys, path.dirname(document.fileName), undefined, document.fileName, undefined, extraFileExtensions);
							const excludeContent = ts.parseJsonSourceFileConfigFileContent(excludeConfig, ts.sys, path.dirname(document.fileName), undefined, document.fileName, undefined, extraFileExtensions);
							const originalFileNames = new Set(excludeContent.fileNames);
							return originalContent.fileNames.filter(fileName => !originalFileNames.has(fileName));
						},
					});
					codeLenses.push(codeLens);
				}
			}
		}

		return codeLenses;
	}

	public async resolveCodeLens(codeLens: vscode.CodeLens, token: vscode.CancellationToken) {
		const data = codeLensData.get(codeLens);
		if (data) {
			const fileNames = data.getFileNames();
			codeLens.command = {
				title: fileNames.length + (fileNames.length === 1 ? ' target' : ' targets'),
				command: fileNames.length ? 'tsconfig-helper.showReferences' : '',
				arguments: [data.uri, data.position, fileNames],
			};
		}
		return codeLens;
	}
}
