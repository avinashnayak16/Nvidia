const vscode = require('vscode');
const path = require('path');
const cp = require('child_process');

/** 
 * @param {vscode.ExtensionContext} context 
 */
function activate(context) {
    console.log('Congratulations, your extension "hsl-extension" is now active!');

    // Register the completion item provider
    const completionProvider = vscode.languages.registerCompletionItemProvider(
        { language: 'hsl', scheme: 'file' },
        {
            // eslint-disable-next-line no-unused-vars
            provideCompletionItems(document, position) {
                const keywords = ['I2CBus', 'GPIOPin'];
                const reservedWords = ['no_verify', 'True', 'False', 'HI', 'LO', 'ALL'];
                const functions = [
                    'Device', 'Sequence', 'DeviceAlias', 'SetVerify', 'ReadVerify',
                    'Write', 'WriteStream', 'Run', 'Modify', 'Wait',
                    'Poll', 'Toggle', 'Set', 'Annotate'
                ];

                const completionItems = [];

                keywords.forEach(keyword => {
                    const item = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword);
                    item.detail = 'HSL Keyword';
                    item.insertText = keyword;
                    completionItems.push(item);
                });

                reservedWords.forEach(word => {
                    const item = new vscode.CompletionItem(word, vscode.CompletionItemKind.Text);
                    item.detail = 'HSL Reserved Word';
                    item.insertText = word;
                    completionItems.push(item);
                });

                functions.forEach(func => {
                    const item = new vscode.CompletionItem(func, vscode.CompletionItemKind.Function);
                    item.detail = 'HSL Function';
                    item.insertText = func + '()';
                    completionItems.push(item);
                });

                return completionItems;
            }
        },
        '.' // Trigger auto-completion after the dot character
    );

    context.subscriptions.push(completionProvider);

    // Register the hover provider
    const hoverProvider = vscode.languages.registerHoverProvider(
        { language: 'hsl', scheme: 'file' },
        {
            provideHover(document, position) {
                const wordRange = document.getWordRangeAtPosition(position);
                const word = document.getText(wordRange);

                const descriptions = {
                    I2CBus: {
                        description: 'Defines an I2C Bus.',
                        example: 'Example: I2CBus bus1 = 0x1;'
                    },
                    GPIOPin: {
                        description: 'Defines a GPIO Pin.',
                        example: 'Example: GPIOPin pin1 = 0x2;'
                    },
                    SetVerify: {
                        description: 'Verifies a device setting.',
                        returnType: 'bool',
                        parameters: [
                            { name: 'device', type: 'Device' },
                            { name: 'offset_list', type: 'int[]' },
                            { name: 'flag', type: 'bool', default: 'True' }
                        ],
                        example: 'Example: SetVerify(device, offset_list, True);'
                    },
                    Run: {
                        description: 'Executes a defined sequence on a specific target.',
                        returnType: 'void',
                        parameters: [
                            { name: 'sequence', type: 'Sequence' },
                            { name: 'target', type: 'string' }
                        ],
                        example: 'Example: Run(sequence, "target1");'
                    }
                };

                const item = descriptions[word];
                if (item) {
                    let markdownContent = `**${word}**\n\n`;
                    markdownContent += `${item.description}\n\n`;

                    if (item.returnType || item.parameters) {
                        markdownContent += '```hsl\n';
                        if (item.returnType) {
                            markdownContent += `${item.returnType} ${word}(`;
                        }

                        if (item.parameters) {
                            const params = item.parameters.map(param =>
                                `${param.type} ${param.name}${param.default ? ` = ${param.default}` : ''}`
                            ).join(', ');
                            markdownContent += params;
                        }

                        markdownContent += ');\n```\n\n';
                    }

                    if (item.example) {
                        markdownContent += `${item.example}\n`;
                    }

                    return new vscode.Hover(new vscode.MarkdownString(markdownContent));
                }

                return null;
            }
        }
    );

    context.subscriptions.push(hoverProvider);

    // Register language configuration
    vscode.languages.setLanguageConfiguration('hsl', {
        comments: {
            lineComment: '//',
            blockComment: ['/*', '*/']
        },
        brackets: [
            ['{', '}'],
            ['[', ']'],
            ['(', ')']
        ],
        autoClosingPairs: [
            { open: '{', close: '}' },
            { open: '[', close: ']' },
            { open: '(', close: ')' },
            { open: '"', close: '"' },
            { open: "'", close: "'" }
        ],
        surroundingPairs: [
            { open: '{', close: '}' },
            { open: '[', close: ']' },
            { open: '(', close: ')' },
            { open: '"', close: '"' },
            { open: "'", close: "'" }
        ],
        indentationRules: {
            increaseIndentPattern: new RegExp('.\\{[^}]*$'),
            decreaseIndentPattern: new RegExp('^\\s*\\}')
        }
    });

    // Register the 'runCompiler' command
    const runCommand = vscode.commands.registerCommand('hsl.runCompiler', function () {
        const editor = vscode.window.activeTextEditor;

        if (!editor) {
            vscode.window.showErrorMessage('No file is open!');
            return;
        }

        const filePath = editor.document.fileName;

        // Ensure the file is an HSL file
        if (!filePath.endsWith('.hsl')) {
            vscode.window.showErrorMessage('Please open an HSL file to run.');
            return;
        }

        // Path to the compiler
        const compilerPath = path.join(context.extensionPath, 'bin', 'compiler');

        // Execute the compiler
        const terminal = vscode.window.createTerminal('HSL Compiler');
        terminal.show();
        terminal.sendText(`${compilerPath} ${filePath}`);
    });

    context.subscriptions.push(runCommand);

    // Register the debug configuration provider
    vscode.debug.registerDebugConfigurationProvider('hsl', {
        // eslint-disable-next-line no-unused-vars
        provideDebugConfigurations(folder, token) {
            return [
                {
                    type: 'hsl',
                    request: 'launch',
                    name: 'Run HSL Compiler',
                    program: '${file}'
                }
            ];
        },
        // eslint-disable-next-line no-unused-vars
        resolveDebugConfiguration(folder, config, token) {
            const programPath = config.program || vscode.window.activeTextEditor.document.fileName;
            const compilerPath = path.join(context.extensionPath, 'bin', 'compiler');

            cp.execFile(compilerPath, [programPath], (error, stdout, stderr) => {
                if (error) {
                    vscode.window.showErrorMessage(`Error: ${error.message}`);
                    return;
                }

                if (stderr) {
                    vscode.window.showErrorMessage(`Compiler Error: ${stderr}`);
                    return;
                }

                vscode.window.showInformationMessage(`Output: ${stdout}`);
            });

            return null; // No active debugging
        }
    });
}

/** 
 * Deactivation function for cleanup 
 */
function deactivate() {}

module.exports = {
    activate,
    deactivate
};
