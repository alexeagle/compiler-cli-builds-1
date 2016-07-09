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
var core_1 = require('@angular/core');
var path = require('path');
var compiler_private_1 = require('./compiler_private');
var reflector_host_1 = require('./reflector_host');
var static_reflection_capabilities_1 = require('./static_reflection_capabilities');
var static_reflector_1 = require('./static_reflector');
var GENERATED_FILES = /\.ngfactory\.ts$|\.css\.ts$|\.css\.shim\.ts$/;
var PREAMBLE = "/**\n * This file is generated by the Angular 2 template compiler.\n * Do not edit.\n */\n /* tslint:disable */\n\n";
var CodeGenerator = (function () {
    function CodeGenerator(options, program, host, staticReflector, compiler, reflectorHost) {
        this.options = options;
        this.program = program;
        this.host = host;
        this.staticReflector = staticReflector;
        this.compiler = compiler;
        this.reflectorHost = reflectorHost;
    }
    CodeGenerator.prototype.readFileMetadata = function (absSourcePath) {
        var moduleMetadata = this.staticReflector.getModuleMetadata(absSourcePath);
        var result = { components: [], appModules: [], fileUrl: absSourcePath };
        if (!moduleMetadata) {
            console.log("WARNING: no metadata found for " + absSourcePath);
            return result;
        }
        var metadata = moduleMetadata['metadata'];
        var symbols = metadata && Object.keys(metadata);
        if (!symbols || !symbols.length) {
            return result;
        }
        var _loop_1 = function(symbol) {
            if (metadata[symbol] && metadata[symbol].__symbolic == 'error') {
                // Ignore symbols that are only included to record error information.
                return "continue";
            }
            var staticType = this_1.reflectorHost.findDeclaration(absSourcePath, symbol, absSourcePath);
            var annotations = this_1.staticReflector.annotations(staticType);
            annotations.forEach(function (annotation) {
                if (annotation instanceof core_1.AppModuleMetadata) {
                    result.appModules.push(staticType);
                }
                else if (annotation instanceof core_1.ComponentMetadata) {
                    result.components.push(staticType);
                }
            });
        };
        var this_1 = this;
        for (var _i = 0, symbols_1 = symbols; _i < symbols_1.length; _i++) {
            var symbol = symbols_1[_i];
            _loop_1(symbol);
        }
        return result;
    };
    // Write codegen in a directory structure matching the sources.
    CodeGenerator.prototype.calculateEmitPath = function (filePath) {
        var root = this.options.basePath;
        for (var _i = 0, _a = this.options.rootDirs || []; _i < _a.length; _i++) {
            var eachRootDir = _a[_i];
            if (this.options.trace) {
                console.log("Check if " + filePath + " is under rootDirs element " + eachRootDir);
            }
            if (path.relative(eachRootDir, filePath).indexOf('.') !== 0) {
                root = eachRootDir;
            }
        }
        return path.join(this.options.genDir, path.relative(root, filePath));
    };
    CodeGenerator.prototype.codegen = function () {
        var _this = this;
        var filePaths = this.program.getSourceFiles().map(function (sf) { return sf.fileName; }).filter(function (f) { return !GENERATED_FILES.test(f); });
        var fileMetas = filePaths.map(function (filePath) { return _this.readFileMetadata(filePath); });
        var appModules = fileMetas.reduce(function (appModules, fileMeta) {
            appModules.push.apply(appModules, fileMeta.appModules);
            return appModules;
        }, []);
        var analyzedAppModules = this.compiler.analyzeModules(appModules);
        return Promise
            .all(fileMetas.map(function (fileMeta) { return _this.compiler
            .compile(fileMeta.fileUrl, analyzedAppModules, fileMeta.components, fileMeta.appModules)
            .then(function (generatedModules) {
            generatedModules.forEach(function (generatedModule) {
                var sourceFile = _this.program.getSourceFile(fileMeta.fileUrl);
                var emitPath = _this.calculateEmitPath(generatedModule.moduleUrl);
                _this.host.writeFile(emitPath, PREAMBLE + generatedModule.source, false, function () { }, [sourceFile]);
            });
        }); }))
            .catch(function (e) { console.error(e.stack); });
    };
    CodeGenerator.create = function (options, program, compilerHost, reflectorHostContext) {
        var xhr = {
            get: function (s) {
                if (!compilerHost.fileExists(s)) {
                    // TODO: We should really have a test for error cases like this!
                    throw new Error("Compilation failed. Resource file not found: " + s);
                }
                return Promise.resolve(compilerHost.readFile(s));
            }
        };
        var urlResolver = compiler.createOfflineCompileUrlResolver();
        var reflectorHost = new reflector_host_1.ReflectorHost(program, compilerHost, options, reflectorHostContext);
        var staticReflector = new static_reflector_1.StaticReflector(reflectorHost);
        static_reflection_capabilities_1.StaticAndDynamicReflectionCapabilities.install(staticReflector);
        var htmlParser = new compiler_private_1.HtmlParser();
        var config = new compiler.CompilerConfig({
            genDebugInfo: options.debug === true,
            defaultEncapsulation: core_1.ViewEncapsulation.Emulated,
            logBindingUpdate: false,
            useJit: false
        });
        var normalizer = new compiler_private_1.DirectiveNormalizer(xhr, urlResolver, htmlParser, config);
        var parser = new compiler_private_1.Parser(new compiler_private_1.Lexer());
        var tmplParser = new compiler_private_1.TemplateParser(parser, new compiler_private_1.DomElementSchemaRegistry(), htmlParser, 
        /*console*/ null, []);
        var resolver = new compiler_private_1.CompileMetadataResolver(new compiler.DirectiveResolver(staticReflector), new compiler.PipeResolver(staticReflector), new compiler.ViewResolver(staticReflector), config, staticReflector);
        var offlineCompiler = new compiler.OfflineCompiler(resolver, normalizer, tmplParser, new compiler_private_1.StyleCompiler(urlResolver), new compiler_private_1.ViewCompiler(config), new compiler_private_1.AppModuleCompiler(), new compiler_private_1.TypeScriptEmitter(reflectorHost));
        return new CodeGenerator(options, program, compilerHost, staticReflector, offlineCompiler, reflectorHost);
    };
    return CodeGenerator;
}());
exports.CodeGenerator = CodeGenerator;
//# sourceMappingURL=codegen.js.map