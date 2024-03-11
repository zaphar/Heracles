// Copyright 2023 Jeremy Wall
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * @typedef PlotList
 * @type {object}
 * @property {Array=} Series
 * @property {Array=} Scalar
 * @property {Array=} StreamInstant - Timestamps are in seconds
 * @property {Array=} Stream - Timestamps are in nanoseconds
 */

/**
 * @typedef QueryData
 * @type {object}
 * @property {object} yaxes
 * @property {?string} legend_orientation
 * @property {Array<PlotList>} plots
 */

/** 
 * @typedef HeaderOrCell
 * @type {object}
 * @property {array} values
 * @property {{color: string}=} fill
 * @property {object=} font
 * @property {string=} font.family
 * @property {number=} font.size
 * @property {string=} font.color
 * @property {{width: number, color: string}=} line
 * @property {Array<number>=} columnwidth
 */

/**
 * @typedef TableTrace
 * @type {object}
 * @property {string=} name
 * @property {string} type 
 * @property {string=} mode
 * @property {HeaderOrCell} header
 * @property {HeaderOrCell} cells - An Array of columns for the table.
 * @property {string=} xaxis 
 * @property {string=} yaxis 
*/

/**
 * @typedef GraphTrace
 * @type {object}
 * @property {string=} name
 * @property {string=} fill
 * @property type {string}
 * @property {string=} mode
 * @property {Array} x
 * @property {Array} y
 * @property {string=} xaxis 
 * @property {string=} yaxis 
*/

/**
 * @typedef PlotTrace
 * @type {(TableTrace|GraphTrace)}
*/

/**
 * @typedef PlotMeta
 * @type {object}
 * @property {string=} name_format
 * @property {string=} yaxis
 * @property {("tonexty"|"tozeroy"|"tonextx"|"tozerox"|"toself"|"tonext")=} fill
 */

