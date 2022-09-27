import * as jsonc from 'jsonc-parser';
import * as path from 'path';
import * as vscode from 'vscode';
import { ts } from './typescript';
import type { FileExtensionInfo } from 'typescript';

const codeLensData = new WeakMap<vscode.CodeLens, {
	uri: vscode.Uri,
	position: vscode.Position,
	getOriginalFileNames?(): string[],
	getNewFileNames(): string[],
	isTotal?: boolean,
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
				getNewFileNames() {
					const jsonConfigFile = ts.readJsonConfigFile(document.fileName, readFile);
					const content = ts.parseJsonSourceFileConfigFileContent(jsonConfigFile, ts.sys, path.dirname(document.fileName), undefined, document.fileName, undefined, extraFileExtensions);
					return content.fileNames;
				},
				isTotal: true,
			});
			codeLenses.push(codeLens);
		}

		const extendsOption = ast?.children?.find(p => p.type === 'property' && p.children?.[0].value === 'extends');
		if (extendsOption) {
			const start = document.positionAt(extendsOption.offset);
			const end = document.positionAt(extendsOption.offset + extendsOption.length);
			const range = new vscode.Range(start, end);
			const codeLens = new vscode.CodeLens(range);
			codeLensData.set(codeLens, {
				uri: document.uri,
				position: start,
				getOriginalFileNames() {
					return [];
				},
				getNewFileNames() {
					const content = ts.parseJsonConfigFileContent({
						extends: jsonObj.extends,
						compilerOptions: jsonObj.compilerOptions,
						files: jsonObj.files ? [] : undefined,
						include: jsonObj.include ? [] : undefined,
						exclude: jsonObj.exclude ? [] : undefined,
					}, ts.sys, path.dirname(document.fileName), undefined, document.fileName, undefined, extraFileExtensions);
					return content.fileNames;
				},
			});
			codeLenses.push(codeLens);
		}

		const filesOption = ast?.children?.find(p => p.type === 'property' && p.children?.[0].value === 'files' && p.children[1].type === 'array');
		if (filesOption) {
			const start = document.positionAt(filesOption.offset);
			const end = document.positionAt(filesOption.offset + filesOption.length);
			const range = new vscode.Range(start, end);
			const codeLens = new vscode.CodeLens(range);
			codeLensData.set(codeLens, {
				uri: document.uri,
				position: start,
				getOriginalFileNames() {
					const content = ts.parseJsonConfigFileContent({
						extends: jsonObj.extends,
						compilerOptions: jsonObj.compilerOptions,
						files: [],
						include: [],
						exclude: [],
					}, ts.sys, path.dirname(document.fileName), undefined, document.fileName, undefined, extraFileExtensions);
					return content.fileNames;
				},
				getNewFileNames() {
					const content = ts.parseJsonConfigFileContent({
						extends: jsonObj.extends,
						compilerOptions: jsonObj.compilerOptions,
						files: jsonObj.files,
						include: [],
						exclude: [],
					}, ts.sys, path.dirname(document.fileName), undefined, document.fileName, undefined, extraFileExtensions);
					return content.fileNames;
				},
			});
			codeLenses.push(codeLens);
		}

		const includeValueNode = ast?.children?.find(p => p.type === 'property' && p.children?.[0].value === 'include' && p.children[1].type === 'array')?.children?.[1];
		if (includeValueNode?.children) {
			for (const pathNode of includeValueNode.children) {
				if (pathNode.type === 'string' && pathNode.value) {
					const start = document.positionAt(pathNode.offset);
					const end = document.positionAt(pathNode.offset + pathNode.length);
					const range = new vscode.Range(start, end);
					const codeLens = new vscode.CodeLens(range);
					codeLensData.set(codeLens, {
						uri: document.uri,
						position: start,
						getOriginalFileNames() {
							const content = ts.parseJsonConfigFileContent({
								extends: jsonObj.extends,
								compilerOptions: jsonObj.compilerOptions,
								files: jsonObj.files,
								include: [],
								exclude: [],
							}, ts.sys, path.dirname(document.fileName), undefined, document.fileName, undefined, extraFileExtensions);
							return content.fileNames;
						},
						getNewFileNames() {
							const content = ts.parseJsonConfigFileContent({
								extends: jsonObj.extends,
								compilerOptions: jsonObj.compilerOptions,
								files: jsonObj.files,
								include: [pathNode.value],
								exclude: [],
							}, ts.sys, path.dirname(document.fileName), undefined, document.fileName, undefined, extraFileExtensions);
							return content.fileNames;
						},
					});
					codeLenses.push(codeLens);
				}
			}
		}

		const excludeValueNode = ast?.children?.find(p => p.type === 'property' && p.children?.[0].value === 'exclude' && p.children[1].type === 'array')?.children?.[1];
		if (excludeValueNode?.children) {
			for (const pathNode of excludeValueNode.children) {
				if (pathNode.type === 'string' && pathNode.value) {
					const start = document.positionAt(pathNode.offset);
					const end = document.positionAt(pathNode.offset + pathNode.length);
					const range = new vscode.Range(start, end);
					const codeLens = new vscode.CodeLens(range);
					codeLensData.set(codeLens, {
						uri: document.uri,
						position: start,
						getOriginalFileNames() {
							const content = ts.parseJsonConfigFileContent({
								extends: jsonObj.extends,
								compilerOptions: jsonObj.compilerOptions,
								files: jsonObj.files,
								include: jsonObj.include,
								exclude: [],
							}, ts.sys, path.dirname(document.fileName), undefined, document.fileName, undefined, extraFileExtensions);
							return content.fileNames;
						},
						getNewFileNames() {
							const content = ts.parseJsonConfigFileContent({
								extends: jsonObj.extends,
								compilerOptions: jsonObj.compilerOptions,
								files: jsonObj.files,
								include: jsonObj.include,
								exclude: [pathNode.value],
							}, ts.sys, path.dirname(document.fileName), undefined, document.fileName, undefined, extraFileExtensions);
							return content.fileNames;
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
			const _originalFileNames = data.getOriginalFileNames?.();
			const originalFileNames = new Set(_originalFileNames ?? []);
			const newFileNames = new Set(data.getNewFileNames());
			const addFileNames = new Set<string>();
			const removeFileNames = new Set<string>();
			for (const fileName of originalFileNames) {
				if (!newFileNames.has(fileName)) {
					removeFileNames.add(fileName);
				}
			}
			for (const fileName of newFileNames) {
				if (!originalFileNames.has(fileName)) {
					addFileNames.add(fileName);
				}
			}
			if (addFileNames.size) {
				codeLens.command = {
					title: addFileNames.size + (data.isTotal ? ' files' : ' matches'),
					command: 'tsconfig-helper.showReferences',
					arguments: [data.uri, data.position, [...addFileNames]],
				};
			}
			if (removeFileNames.size) {
				codeLens.command = {
					title: removeFileNames.size + (data.isTotal ? ' files' : ' matches'),
					command: 'tsconfig-helper.showReferences',
					arguments: [data.uri, data.position, [...removeFileNames]],
				};
			}
			if (!addFileNames.size && !removeFileNames.size) {
				codeLens.command = {
					title: '0 matches',
					command: '',
					arguments: [],
				};
			}
		}
		return codeLens;
	}
}
