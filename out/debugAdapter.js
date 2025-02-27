/* eslint-disable no-unused-vars */
const vscode = require('vscode-debugadapter');
const { DebugSession, InitializedEvent, StoppedEvent, TerminatedEvent, BreakpointEvent } = vscode;
const { spawnSync } = require('child_process'); // Used to run the compiler synchronously

class HSLDebugSession extends DebugSession {
    constructor() {
        super();
        console.log("HSL Debugger Initialized");
        this.breakpoints = new Map();
        this.programCounter = 0;
        this.sequence = []; // Parsed commands
        this.variables = new Map(); // Variable states
    }

    /**
     * Initialize request: Define capabilities of the debugger
     */
    initializeRequest(response) {
        response.body = {
            supportsConfigurationDoneRequest: true,
            supportsSetVariable: true,
            supportsStepIn: true,
            supportsStepOut: true,
            supportsStepBack: false,
            supportsEvaluateForHovers: true
        };
        this.sendResponse(response);
        this.sendEvent(new InitializedEvent());
    }

    /**
     * Launch request: Compile and load the program for the supported language
     */
    launchRequest(response, args) {
        const programPath = args.program;
        const language = args.language || 'HSL'; // Default to HSL if no language is specified

        try {
            // Invoke the compiler
            const compileResult = this.compileProgram(programPath, language);
            if (compileResult.error) {
                throw new Error(compileResult.error);
            }

            console.log(`Compilation successful for language: ${language}`);

            // Load compiled output
            this.sequence = compileResult.compiledOutput.split('\n').map((line, index) => ({
                line,
                index
            }));

            // Start debugging
            this.sendEvent(new StoppedEvent('entry', 1));
            this.sendResponse(response);
        } catch (error) {
            console.error("Compilation failed:", error.message);
            response.success = false;
            response.message = `Compilation failed: ${error.message}`;
            this.sendResponse(response);
        }
    }

    /**
     * Compile the program for the specified language
     */
    compileProgram(programPath, language) {
        const compilerPath = this.getCompilerPath(language);
        const args = [programPath];

        // Run the compiler
        const result = spawnSync(compilerPath, args, { encoding: 'utf-8' });

        if (result.error) {
            return { error: result.error.message };
        }

        if (result.status !== 0) {
            return { error: result.stderr || "Unknown compiler error" };
        }

        // Compiler outputs the compiled program
        return { compiledOutput: result.stdout };
    }

    /**
     * Get the compiler path based on the language
     */
    getCompilerPath(language) {
        const compilers = {
            HSL: '/Users/vaish/toolbox/hsl-extension/compiler',
            NewLang: '/Users/vaish/toolbox/hsl-extension/compiler' // Replace with actual compiler path
        };

        return compilers[language] || '/Users/vaish/toolbox/hsl-extension/compiler';
    }

    /**
     * Set breakpoints
     */
    setBreakPointsRequest(response, args) {
        const breakpoints = args.breakpoints.map(bp => ({
            verified: true,
            line: bp.line
        }));

        // Store breakpoints for the file
        this.breakpoints.set(args.source.path, breakpoints);
        response.body = { breakpoints };
        this.sendResponse(response);
    }

    /**
     * Handle stepping through lines
     */
    nextRequest(response) {
        // Move to the next command
        this.programCounter++;
        if (this.programCounter < this.sequence.length) {
            const currentLine = this.sequence[this.programCounter].line;
            this.evaluateLine(currentLine);
            this.sendEvent(new StoppedEvent('step', 1));
        } else {
            this.sendEvent(new TerminatedEvent());
        }
        this.sendResponse(response);
    }

    /**
     * Evaluate a line based on grammar
     */
    evaluateLine(line) {
        line = line.trim();
        if (line.startsWith('//') || line === '') return; // Ignore comments and empty lines

        // Parse basic commands (this should be enhanced based on grammar)
        if (line.startsWith('I2CBus') || line.startsWith('GPIOPin')) {
            const [type, id, , value] = line.split(/\s+/);
            this.variables.set(id, parseInt(value, 16));
        } else if (line.startsWith('Run')) {
            const sequenceId = line.match(/Run\s*\((\w+)\)/)?.[1];
            console.log(`Running sequence: ${sequenceId}`);
        }
        // Add more rules for grammar constructs
    }

    /**
     * Provide variable information
     */
    variablesRequest(response) {
        response.body = {
            variables: Array.from(this.variables.entries()).map(([name, value]) => ({
                name,
                value: value.toString(),
                variablesReference: 0
            }))
        };
        this.sendResponse(response);
    }
}

DebugSession.run(HSLDebugSession);
