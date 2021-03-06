/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { PartialModule } from '@angular/compiler';
import * as ts from 'typescript';
export declare type Transformer = (sourceFile: ts.SourceFile) => ts.SourceFile;
export declare type TransformerFactory = (context: ts.TransformationContext) => Transformer;
/**
 * Returns a transformer that adds the requested static methods specified by modules.
 */
export declare function getAngularClassTransformerFactory(modules: PartialModule[]): TransformerFactory;
