import * as vscode from '@volar/language-server';
import { createConnection, createServer, createSimpleProject, loadTsdkByPath } from '@volar/language-server/node';
import * as jsonc from 'jsonc-parser';
import * as path from 'path';
import type * as ts from 'typescript/lib/tsserverlibrary';
import { URI } from 'vscode-uri';
import type { InitializationOptions } from './index.js';

interface CodeLensData {
	uri: string,
	position: vscode.Position,
	beforeOptions?: any,
	afterOptions?: any,
	isTotal?: boolean,
}

const connection = createConnection();
const server = createServer(connection);

connection.onInitialize(params => {
	const initOptions: InitializationOptions = params.initializationOptions;
	const { typescript: ts } = loadTsdkByPath(initOptions.typescript!.tsdk!, params.locale);

	return server.initialize(params, createSimpleProject([]), [
		{
			name: 'tsconfig-helper',
			capabilities: {
				codeLensProvider: {
					resolveProvider: true,
				},
			},
			create(context) {
				return {
					provideCodeLenses(document) {

						const codeLenses: vscode.CodeLens[] = [];
						const ast = jsonc.parseTree(document.getText());
						const jsonObj = jsonc.parse(document.getText());

						if (ast) {
							const start = document.positionAt(ast.offset);
							const end = document.positionAt(ast.offset + ast.length);
							const range = vscode.Range.create(start, end);
							const codeLens = vscode.CodeLens.create(range, {
								uri: document.uri,
								position: start,
								afterOptions: jsonObj,
								isTotal: true,
							} satisfies CodeLensData);
							codeLenses.push(codeLens);
						}

						const extendsOption = ast?.children?.find(p => p.type === 'property' && p.children?.[0].value === 'extends');
						if (extendsOption) {
							const start = document.positionAt(extendsOption.offset);
							const end = document.positionAt(extendsOption.offset + extendsOption.length);
							const range = vscode.Range.create(start, end);
							const codeLens = vscode.CodeLens.create(range, {
								uri: document.uri,
								position: start,
								beforeOptions: undefined,
								afterOptions: {
									extends: jsonObj.extends,
									compilerOptions: jsonObj.compilerOptions,
									files: jsonObj.files ? [] : undefined,
									include: jsonObj.include ? [] : undefined,
									exclude: jsonObj.exclude ? [] : undefined,
								},
							} satisfies CodeLensData);
							codeLenses.push(codeLens);
						}

						const filesOption = ast?.children?.find(p => p.type === 'property' && p.children?.[0].value === 'files' && p.children[1].type === 'array');
						if (filesOption) {
							const start = document.positionAt(filesOption.offset);
							const end = document.positionAt(filesOption.offset + filesOption.length);
							const range = vscode.Range.create(start, end);
							const codeLens = vscode.CodeLens.create(range, {
								uri: document.uri,
								position: start,
								beforeOptions: {
									extends: jsonObj.extends,
									compilerOptions: jsonObj.compilerOptions,
									files: [],
									include: [],
									exclude: [],
								},
								afterOptions: {
									extends: jsonObj.extends,
									compilerOptions: jsonObj.compilerOptions,
									files: jsonObj.files,
									include: [],
									exclude: [],
								},
							} satisfies CodeLensData);
							codeLenses.push(codeLens);
						}

						const includeValueNode = ast?.children?.find(p => p.type === 'property' && p.children?.[0].value === 'include' && p.children[1].type === 'array')?.children?.[1];
						if (includeValueNode?.children) {
							for (const pathNode of includeValueNode.children) {
								if (pathNode.type === 'string' && pathNode.value) {
									const start = document.positionAt(pathNode.offset);
									const end = document.positionAt(pathNode.offset + pathNode.length);
									const range = vscode.Range.create(start, end);
									const codeLens = vscode.CodeLens.create(range, {
										uri: document.uri,
										position: start,
										beforeOptions: {
											extends: jsonObj.extends,
											compilerOptions: jsonObj.compilerOptions,
											files: jsonObj.files,
											include: [],
											exclude: [],
										},
										afterOptions: {
											extends: jsonObj.extends,
											compilerOptions: jsonObj.compilerOptions,
											files: jsonObj.files,
											include: [pathNode.value],
											exclude: [],
										},
									} satisfies CodeLensData);
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
									const range = vscode.Range.create(start, end);
									const codeLens = vscode.CodeLens.create(range, {
										uri: document.uri,
										position: start,
										beforeOptions: {
											extends: jsonObj.extends,
											compilerOptions: jsonObj.compilerOptions,
											files: jsonObj.files,
											include: jsonObj.include,
											exclude: [],
										},
										afterOptions: {
											extends: jsonObj.extends,
											compilerOptions: jsonObj.compilerOptions,
											files: jsonObj.files,
											include: jsonObj.include,
											exclude: [pathNode.value],
										},
									} satisfies CodeLensData);
									codeLenses.push(codeLens);
								}
							}
						}

						return codeLenses;
					},
					async resolveCodeLens(codeLens) {

						const extraFileExtensions = (initOptions.tsconfigHelper?.extraFileExtensions ?? []).map<ts.FileExtensionInfo>(ext => ({
							extension: ext,
							isMixedContent: true,
							scriptKind: ts.ScriptKind.Deferred,
						}));
						const data: CodeLensData = codeLens.data;
						const uri = URI.parse(data.uri);
						const fileName = uri.fsPath;
						const beforeFiles = new Set(data.beforeOptions ? ts.parseJsonConfigFileContent(
							data.beforeOptions,
							ts.sys,
							path.dirname(fileName),
							undefined,
							fileName,
							undefined,
							extraFileExtensions,
						).fileNames : []);
						const afterFiles = new Set(data.afterOptions ? ts.parseJsonConfigFileContent(
							data.afterOptions,
							ts.sys,
							path.dirname(fileName),
							undefined,
							fileName,
							undefined,
							extraFileExtensions,
						).fileNames : []);
						const addFileNames = new Set<string>();
						const removeFileNames = new Set<string>();

						for (const fileName of beforeFiles) {
							if (!afterFiles.has(fileName)) {
								removeFileNames.add(fileName);
							}
						}
						for (const fileName of afterFiles) {
							if (!beforeFiles.has(fileName)) {
								addFileNames.add(fileName);
							}
						}

						const all = [...addFileNames, ...removeFileNames];
						if (all.length) {
							codeLens.command = context?.commands.showReferences.create(
								data.uri,
								data.position,
								[...addFileNames, ...removeFileNames].map<vscode.Location>(fileName => {
									return vscode.Location.create(
										URI.file(fileName).toString(),
										vscode.Range.create(0, 0, 0, 0),
									);
								})
							);
						}
						else {
							codeLens.command = {
								title: '',
								command: '',
								arguments: [],
							};
						}
						if (codeLens.command) {
							codeLens.command.title = all.length + (data.isTotal ? ' root files' : ' matches');
							if (data.isTotal && initOptions.tsconfigHelper?.extraFileExtensions?.length) {
								const exts = initOptions.tsconfigHelper.extraFileExtensions;
								const extraText = exts
									.map(ext => [ext, all.filter(file => file.endsWith('.' + ext))])
									.filter(([_, files]) => files.length)
									.map(([ext, files]) => `${files.length} ${ext} files`)
									.join(', ');
								if (extraText !== '') {
									codeLens.command.title += ` (${extraText})`
								}
							}
						}

						return codeLens;
					},
				};
			},
		}
	]);
});
connection.onInitialized(server.initialized);
connection.onShutdown(server.shutdown);

connection.listen();
