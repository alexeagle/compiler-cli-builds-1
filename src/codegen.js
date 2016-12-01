/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
"use strict";
/**
 * Transform template html and css into executable code.
 * Intended to be used in a build step.
 */
var compiler = require('@angular/compiler');
var fs_1 = require('fs');
var path = require('path');
var compiler_host_1 = require('./compiler_host');
var path_mapped_compiler_host_1 = require('./path_mapped_compiler_host');
var GENERATED_FILES = /\.ngfactory\.ts$|\.css\.ts$|\.css\.shim\.ts$/;
var GENERATED_OR_DTS_FILES = /\.d\.ts$|\.ngfactory\.ts$|\.css\.ts$|\.css\.shim\.ts$/;
var PREAMBLE = "/**\n * @fileoverview This file is generated by the Angular 2 template compiler.\n * Do not edit.\n * @suppress {suspiciousCode,uselessCode,missingProperties}\n */\n /* tslint:disable */\n\n";
var CodeGenerator = (function () {
    function CodeGenerator(options, program, host, compiler, ngCompilerHost) {
        this.options = options;
        this.program = program;
        this.host = host;
        this.compiler = compiler;
        this.ngCompilerHost = ngCompilerHost;
    }
    // Write codegen in a directory structure matching the sources.
    CodeGenerator.prototype.calculateEmitPath = function (filePath) {
        var root = this.options.basePath;
        for (var _i = 0, _a = this.options.rootDirs || []; _i < _a.length; _i++) {
            var eachRootDir = _a[_i];
            if (this.options.trace) {
                console.error("Check if " + filePath + " is under rootDirs element " + eachRootDir);
            }
            if (path.relative(eachRootDir, filePath).indexOf('.') !== 0) {
                root = eachRootDir;
            }
        }
        // transplant the codegen path to be inside the `genDir`
        var relativePath = path.relative(root, filePath);
        while (relativePath.startsWith('..' + path.sep)) {
            // Strip out any `..` path such as: `../node_modules/@foo` as we want to put everything
            // into `genDir`.
            relativePath = relativePath.substr(3);
        }
        return path.join(this.options.genDir, relativePath);
    };
    CodeGenerator.prototype.codegen = function () {
        var _this = this;
        return this.compiler
            .compileAll(this.program.getSourceFiles().map(function (sf) { return _this.ngCompilerHost.getCanonicalFileName(sf.fileName); }))
            .then(function (generatedModules) {
            generatedModules.forEach(function (generatedModule) {
                var sourceFile = _this.program.getSourceFile(generatedModule.fileUrl);
                var emitPath = _this.calculateEmitPath(generatedModule.moduleUrl);
                _this.host.writeFile(emitPath, PREAMBLE + generatedModule.source, false, function () { }, [sourceFile]);
            });
        });
    };
    CodeGenerator.create = function (options, cliOptions, program, tsCompilerHost, compilerHostContext, ngCompilerHost) {
        if (!ngCompilerHost) {
            var usePathMapping = !!options.rootDirs && options.rootDirs.length > 0;
            var context = compilerHostContext || new compiler_host_1.ModuleResolutionHostAdapter(tsCompilerHost);
            ngCompilerHost = usePathMapping ? new path_mapped_compiler_host_1.PathMappedCompilerHost(program, options, context) :
                new compiler_host_1.CompilerHost(program, options, context);
        }
        var transFile = cliOptions.i18nFile;
        var locale = cliOptions.locale;
        var transContent = '';
        if (transFile) {
            if (!locale) {
                throw new Error("The translation file (" + transFile + ") locale must be provided. Use the --locale option.");
            }
            transContent = fs_1.readFileSync(transFile, 'utf8');
        }
        var aotCompiler = compiler.createAotCompiler(ngCompilerHost, {
            debug: options.debug === true,
            translations: transContent,
            i18nFormat: cliOptions.i18nFormat,
            locale: cliOptions.locale,
            excludeFilePattern: options.generateCodeForLibraries === false ? GENERATED_OR_DTS_FILES :
                GENERATED_FILES
        }).compiler;
        return new CodeGenerator(options, program, tsCompilerHost, aotCompiler, ngCompilerHost);
    };
    return CodeGenerator;
}());
exports.CodeGenerator = CodeGenerator;
function excludeFilePattern(options) {
    return options.generateCodeForLibraries === false ? GENERATED_OR_DTS_FILES : GENERATED_FILES;
}
exports.excludeFilePattern = excludeFilePattern;
//# sourceMappingURL=codegen.js.map