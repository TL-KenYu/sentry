// import {GridColumn} from './types';

export const COL_WIDTH_MIN = 50;

// Default width if it wasn't specified
export const COL_WIDTH_DEFAULT = '300px';
export const COL_WIDTH_NUMBER = COL_WIDTH_MIN;
export const COL_WIDTH_STRING = 250;
export const COL_WIDTH_STRING_LONG = 400;

// Store state at the start of "resize" action
export type ColResizeMetadata = {
  columnIndex: number; // Column being resized
  columnOffsetWidth: number; //
  columnHtmlElement: HTMLElement; // Literally the column being resized
  cursorX: number; // X-coordinate of cursor on window
};

// export function resizeStart(
//   e: React.MouseEvent,
//   columnIndex: number,
//   column: GridColumn
// ): ColResizeMetadata {
//   const cell = e.currentTarget && e.currentTarget.parentElement;
//   if (!cell) {
//     return;
//   }

//   return {
//     columnIndex: columnIndex,
//     columnOffsetWidth: cell.offsetWidth,
//     columnHtmlElement: cell,
//     cursorX: e.clientX,
//   };
// }

// export function resizeColumn(e: MouseEvent) {

// }
