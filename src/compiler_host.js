"use strict";
/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var compiler_1 = require("@angular/compiler");
var fs = require("fs");
var path = require("path");
var ts = require("typescript");
var index_1 = require("./metadata/index");
var EXT = /(\.ts|\.d\.ts|\.js|\.jsx|\.tsx)$/;
var DTS = /\.d\.ts$/;
var NODE_MODULES = '/node_modules/';
var IS_GENERATED = /\.(ngfactory|ngstyle|ngsummary)$/;
var GENERATED_FILES = /\.ngfactory\.ts$|\.ngstyle\.ts$|\.ngsummary\.ts$/;
var GENERATED_OR_DTS_FILES = /\.d\.ts$|\.ngfactory\.ts$|\.ngstyle\.ts$|\.ngsummary\.ts$/;
var SHALLOW_IMPORT = /^((\w|-)+|(@(\w|-)+(\/(\w|-)+)+))$/;
var BaseAotCompilerHost = (function () {
    function BaseAotCompilerHost(options, context) {
        this.options = options;
        this.context = context;
        this.resolverCache = new Map();
        this.flatModuleIndexCache = new Map();
        this.flatModuleIndexNames = new Set();
        this.flatModuleIndexRedirectNames = new Set();
    }
    BaseAotCompilerHost.prototype.getImportAs = function (fileName) {
        // Note: `importAs` can only be in .metadata.json files
        // So it is enough to call this.readMetadata, and we get the
        // benefit that this is cached.
        if (DTS.test(fileName)) {
            var metadatas = this.readMetadata(fileName);
            if (metadatas) {
                for (var _i = 0, metadatas_1 = metadatas; _i < metadatas_1.length; _i++) {
                    var metadata = metadatas_1[_i];
                    if (metadata.importAs) {
                        return metadata.importAs;
                    }
                }
            }
        }
        return undefined;
    };
    BaseAotCompilerHost.prototype.getMetadataFor = function (filePath) {
        if (!this.context.fileExists(filePath)) {
            // If the file doesn't exists then we cannot return metadata for the file.
            // This will occur if the user referenced a declared module for which no file
            // exists for the module (i.e. jQuery or angularjs).
            return;
        }
        if (DTS.test(filePath)) {
            var metadatas = this.readMetadata(filePath);
            if (!metadatas) {
                // If there is a .d.ts file but no metadata file we need to produce a
                // v3 metadata from the .d.ts file as v3 includes the exports we need
                // to resolve symbols.
                metadatas = [this.upgradeVersion1Metadata({ '__symbolic': 'module', 'version': 1, 'metadata': {} }, filePath)];
            }
            return metadatas;
        }
        // Attention: don't cache this, so that e.g. the LanguageService
        // can read in changes from source files in the metadata!
        var metadata = this.getMetadataForSourceFile(filePath);
        return metadata ? [metadata] : [];
    };
    BaseAotCompilerHost.prototype.readMetadata = function (dtsFilePath) {
        var metadatas = this.resolverCache.get(dtsFilePath);
        if (metadatas) {
            return metadatas;
        }
        var metadataPath = dtsFilePath.replace(DTS, '.metadata.json');
        if (!this.context.fileExists(metadataPath)) {
            return undefined;
        }
        try {
            var metadataOrMetadatas = JSON.parse(this.context.readFile(metadataPath));
            var metadatas_2 = metadataOrMetadatas ?
                (Array.isArray(metadataOrMetadatas) ? metadataOrMetadatas : [metadataOrMetadatas]) :
                [];
            var v1Metadata = metadatas_2.find(function (m) { return m.version === 1; });
            var v3Metadata = metadatas_2.find(function (m) { return m.version === 3; });
            if (!v3Metadata && v1Metadata) {
                metadatas_2.push(this.upgradeVersion1Metadata(v1Metadata, dtsFilePath));
            }
            this.resolverCache.set(dtsFilePath, metadatas_2);
            return metadatas_2;
        }
        catch (e) {
            console.error("Failed to read JSON file " + metadataPath);
            throw e;
        }
    };
    BaseAotCompilerHost.prototype.upgradeVersion1Metadata = function (v1Metadata, dtsFilePath) {
        // patch up v1 to v3 by merging the metadata with metadata collected from the d.ts file
        // as the only difference between the versions is whether all exports are contained in
        // the metadata and the `extends` clause.
        var v3Metadata = { '__symbolic': 'module', 'version': 3, 'metadata': {} };
        if (v1Metadata.exports) {
            v3Metadata.exports = v1Metadata.exports;
        }
        for (var prop in v1Metadata.metadata) {
            v3Metadata.metadata[prop] = v1Metadata.metadata[prop];
        }
        var exports = this.getMetadataForSourceFile(dtsFilePath);
        if (exports) {
            for (var prop in exports.metadata) {
                if (!v3Metadata.metadata[prop]) {
                    v3Metadata.metadata[prop] = exports.metadata[prop];
                }
            }
            if (exports.exports) {
                v3Metadata.exports = exports.exports;
            }
        }
        return v3Metadata;
    };
    BaseAotCompilerHost.prototype.loadResource = function (filePath) {
        if (this.context.readResource)
            return this.context.readResource(filePath);
        if (!this.context.fileExists(filePath)) {
            throw compiler_1.syntaxError("Error: Resource file not found: " + filePath);
        }
        return this.context.readFile(filePath);
    };
    BaseAotCompilerHost.prototype.loadSummary = function (filePath) {
        if (this.context.fileExists(filePath)) {
            return this.context.readFile(filePath);
        }
        return null;
    };
    BaseAotCompilerHost.prototype.isSourceFile = function (filePath) {
        var excludeRegex = this.options.generateCodeForLibraries === false ? GENERATED_OR_DTS_FILES : GENERATED_FILES;
        if (excludeRegex.test(filePath)) {
            return false;
        }
        if (DTS.test(filePath)) {
            // Check for a bundle index.
            if (this.hasBundleIndex(filePath)) {
                var normalFilePath = path.normalize(filePath);
                return this.flatModuleIndexNames.has(normalFilePath) ||
                    this.flatModuleIndexRedirectNames.has(normalFilePath);
            }
        }
        return true;
    };
    BaseAotCompilerHost.prototype.hasBundleIndex = function (filePath) {
        var _this = this;
        var checkBundleIndex = function (directory) {
            var result = _this.flatModuleIndexCache.get(directory);
            if (result == null) {
                if (path.basename(directory) == 'node_module') {
                    // Don't look outside the node_modules this package is installed in.
                    result = false;
                }
                else {
                    // A bundle index exists if the typings .d.ts file has a metadata.json that has an
                    // importAs.
                    try {
                        var packageFile = path.join(directory, 'package.json');
                        if (_this.context.fileExists(packageFile)) {
                            // Once we see a package.json file, assume false until it we find the bundle index.
                            result = false;
                            var packageContent = JSON.parse(_this.context.readFile(packageFile));
                            if (packageContent.typings) {
                                var typings = path.normalize(path.join(directory, packageContent.typings));
                                if (DTS.test(typings)) {
                                    var metadataFile = typings.replace(DTS, '.metadata.json');
                                    if (_this.context.fileExists(metadataFile)) {
                                        var metadata = JSON.parse(_this.context.readFile(metadataFile));
                                        if (metadata.flatModuleIndexRedirect) {
                                            _this.flatModuleIndexRedirectNames.add(typings);
                                            // Note: don't set result = true,
                                            // as this would mark this folder
                                            // as having a bundleIndex too early without
                                            // filling the bundleIndexNames.
                                        }
                                        else if (metadata.importAs) {
                                            _this.flatModuleIndexNames.add(typings);
                                            result = true;
                                        }
                                    }
                                }
                            }
                        }
                        else {
                            var parent_1 = path.dirname(directory);
                            if (parent_1 != directory) {
                                // Try the parent directory.
                                result = checkBundleIndex(parent_1);
                            }
                            else {
                                result = false;
                            }
                        }
                    }
                    catch (e) {
                        // If we encounter any errors assume we this isn't a bundle index.
                        result = false;
                    }
                }
                _this.flatModuleIndexCache.set(directory, result);
            }
            return result;
        };
        return checkBundleIndex(path.dirname(filePath));
    };
    return BaseAotCompilerHost;
}());
exports.BaseAotCompilerHost = BaseAotCompilerHost;
// TODO(tbosch): remove this once G3 uses the transformer compiler!
var CompilerHost = (function (_super) {
    __extends(CompilerHost, _super);
    function CompilerHost(program, options, context, collectorOptions) {
        var _this = _super.call(this, options, context) || this;
        _this.program = program;
        _this.moduleFileNames = new Map();
        _this.metadataProvider = new index_1.MetadataCollector(collectorOptions);
        // normalize the path so that it never ends with '/'.
        _this.basePath = path.normalize(path.join(_this.options.basePath, '.')).replace(/\\/g, '/');
        _this.genDir = path.normalize(path.join(_this.options.genDir, '.')).replace(/\\/g, '/');
        var genPath = path.relative(_this.basePath, _this.genDir);
        _this.isGenDirChildOfRootDir = genPath === '' || !genPath.startsWith('..');
        _this.resolveModuleNameHost = Object.create(_this.context);
        // When calling ts.resolveModuleName,
        // additional allow checks for .d.ts files to be done based on
        // checks for .ngsummary.json files,
        // so that our codegen depends on fewer inputs and requires to be called
        // less often.
        // This is needed as we use ts.resolveModuleName in reflector_host
        // and it should be able to resolve summary file names.
        _this.resolveModuleNameHost.fileExists = function (fileName) {
            if (_this.context.fileExists(fileName)) {
                return true;
            }
            if (DTS.test(fileName)) {
                var base = fileName.substring(0, fileName.length - 5);
                return _this.context.fileExists(base + '.ngsummary.json');
            }
            return false;
        };
        _this.urlResolver = compiler_1.createOfflineCompileUrlResolver();
        return _this;
    }
    CompilerHost.prototype.getSourceFile = function (filePath) {
        var sf = this.program.getSourceFile(filePath);
        if (!sf) {
            if (this.context.fileExists(filePath)) {
                var sourceText = this.context.readFile(filePath);
                sf = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
            }
            else {
                throw new Error("Source file " + filePath + " not present in program.");
            }
        }
        return sf;
    };
    CompilerHost.prototype.getMetadataForSourceFile = function (filePath) {
        return this.metadataProvider.getMetadata(this.getSourceFile(filePath));
    };
    CompilerHost.prototype.toSummaryFileName = function (fileName, referringSrcFileName) {
        return fileName.replace(EXT, '') + '.d.ts';
    };
    CompilerHost.prototype.fromSummaryFileName = function (fileName, referringLibFileName) { return fileName; };
    CompilerHost.prototype.calculateEmitPath = function (filePath) {
        // Write codegen in a directory structure matching the sources.
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
    // We use absolute paths on disk as canonical.
    CompilerHost.prototype.getCanonicalFileName = function (fileName) { return fileName; };
    CompilerHost.prototype.moduleNameToFileName = function (m, containingFile) {
        var key = m + ':' + (containingFile || '');
        var result = this.moduleFileNames.get(key) || null;
        if (!result) {
            if (!containingFile || !containingFile.length) {
                if (m.indexOf('.') === 0) {
                    throw new Error('Resolution of relative paths requires a containing file.');
                }
                // Any containing file gives the same result for absolute imports
                containingFile = this.getCanonicalFileName(path.join(this.basePath, 'index.ts'));
            }
            m = m.replace(EXT, '');
            var resolved = ts.resolveModuleName(m, containingFile.replace(/\\/g, '/'), this.options, this.resolveModuleNameHost)
                .resolvedModule;
            result = resolved ? this.getCanonicalFileName(resolved.resolvedFileName) : null;
            this.moduleFileNames.set(key, result);
        }
        return result;
    };
    /**
     * We want a moduleId that will appear in import statements in the generated code.
     * These need to be in a form that system.js can load, so absolute file paths don't work.
     *
     * The `containingFile` is always in the `genDir`, where as the `importedFile` can be in
     * `genDir`, `node_module` or `basePath`.  The `importedFile` is either a generated file or
     * existing file.
     *
     *               | genDir   | node_module |  rootDir
     * --------------+----------+-------------+----------
     * generated     | relative |   relative  |   n/a
     * existing file |   n/a    |   absolute  |  relative(*)
     *
     * NOTE: (*) the relative path is computed depending on `isGenDirChildOfRootDir`.
     */
    CompilerHost.prototype.fileNameToModuleName = function (importedFile, containingFile) {
        var importAs = this.getImportAs(importedFile);
        if (importAs) {
            return importAs;
        }
        // If a file does not yet exist (because we compile it later), we still need to
        // assume it exists it so that the `resolve` method works!
        if (importedFile !== containingFile && !this.context.fileExists(importedFile)) {
            this.context.assumeFileExists(importedFile);
        }
        containingFile = this.rewriteGenDirPath(containingFile);
        var containingDir = path.dirname(containingFile);
        // drop extension
        importedFile = importedFile.replace(EXT, '');
        var nodeModulesIndex = importedFile.indexOf(NODE_MODULES);
        var importModule = nodeModulesIndex === -1 ?
            null :
            importedFile.substring(nodeModulesIndex + NODE_MODULES.length);
        var isGeneratedFile = IS_GENERATED.test(importedFile);
        if (isGeneratedFile) {
            // rewrite to genDir path
            if (importModule) {
                // it is generated, therefore we do a relative path to the factory
                return this.dotRelative(containingDir, this.genDir + NODE_MODULES + importModule);
            }
            else {
                // assume that import is also in `genDir`
                importedFile = this.rewriteGenDirPath(importedFile);
                return this.dotRelative(containingDir, importedFile);
            }
        }
        else {
            // user code import
            if (importModule) {
                return importModule;
            }
            else {
                if (!this.isGenDirChildOfRootDir) {
                    // assume that they are on top of each other.
                    importedFile = importedFile.replace(this.basePath, this.genDir);
                }
                if (SHALLOW_IMPORT.test(importedFile)) {
                    return importedFile;
                }
                return this.dotRelative(containingDir, importedFile);
            }
        }
    };
    CompilerHost.prototype.resourceNameToFileName = function (m, containingFile) {
        return this.urlResolver.resolve(containingFile, m);
    };
    /**
     * Moves the path into `genDir` folder while preserving the `node_modules` directory.
     */
    CompilerHost.prototype.rewriteGenDirPath = function (filepath) {
        var nodeModulesIndex = filepath.indexOf(NODE_MODULES);
        if (nodeModulesIndex !== -1) {
            // If we are in node_modules, transplant them into `genDir`.
            return path.join(this.genDir, filepath.substring(nodeModulesIndex));
        }
        else {
            // pretend that containing file is on top of the `genDir` to normalize the paths.
            // we apply the `genDir` => `rootDir` delta through `rootDirPrefix` later.
            return filepath.replace(this.basePath, this.genDir);
        }
    };
    CompilerHost.prototype.dotRelative = function (from, to) {
        var rPath = path.relative(from, to).replace(/\\/g, '/');
        return rPath.startsWith('.') ? rPath : './' + rPath;
    };
    return CompilerHost;
}(BaseAotCompilerHost));
exports.CompilerHost = CompilerHost;
var CompilerHostContextAdapter = (function () {
    function CompilerHostContextAdapter() {
        this.assumedExists = {};
    }
    CompilerHostContextAdapter.prototype.assumeFileExists = function (fileName) { this.assumedExists[fileName] = true; };
    return CompilerHostContextAdapter;
}());
exports.CompilerHostContextAdapter = CompilerHostContextAdapter;
var ModuleResolutionHostAdapter = (function (_super) {
    __extends(ModuleResolutionHostAdapter, _super);
    function ModuleResolutionHostAdapter(host) {
        var _this = _super.call(this) || this;
        _this.host = host;
        if (host.directoryExists) {
            _this.directoryExists = function (directoryName) { return host.directoryExists(directoryName); };
        }
        return _this;
    }
    ModuleResolutionHostAdapter.prototype.fileExists = function (fileName) {
        return this.assumedExists[fileName] || this.host.fileExists(fileName);
    };
    ModuleResolutionHostAdapter.prototype.readFile = function (fileName) { return this.host.readFile(fileName); };
    ModuleResolutionHostAdapter.prototype.readResource = function (s) {
        if (!this.host.fileExists(s)) {
            // TODO: We should really have a test for error cases like this!
            throw new Error("Compilation failed. Resource file not found: " + s);
        }
        return Promise.resolve(this.host.readFile(s));
    };
    return ModuleResolutionHostAdapter;
}(CompilerHostContextAdapter));
exports.ModuleResolutionHostAdapter = ModuleResolutionHostAdapter;
var NodeCompilerHostContext = (function (_super) {
    __extends(NodeCompilerHostContext, _super);
    function NodeCompilerHostContext() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    NodeCompilerHostContext.prototype.fileExists = function (fileName) {
        return this.assumedExists[fileName] || fs.existsSync(fileName);
    };
    NodeCompilerHostContext.prototype.directoryExists = function (directoryName) {
        try {
            return fs.statSync(directoryName).isDirectory();
        }
        catch (e) {
            return false;
        }
    };
    NodeCompilerHostContext.prototype.readFile = function (fileName) { return fs.readFileSync(fileName, 'utf8'); };
    NodeCompilerHostContext.prototype.readResource = function (s) {
        if (!this.fileExists(s)) {
            // TODO: We should really have a test for error cases like this!
            throw new Error("Compilation failed. Resource file not found: " + s);
        }
        return Promise.resolve(this.readFile(s));
    };
    return NodeCompilerHostContext;
}(CompilerHostContextAdapter));
exports.NodeCompilerHostContext = NodeCompilerHostContext;
//# sourceMappingURL=compiler_host.js.map