import * as vscode from 'vscode';

const tsPath = require.resolve('./extensions/node_modules/typescript/lib/typescript.js', { paths: [vscode.env.appRoot] });

export const ts = require(tsPath) as typeof import('typescript');
