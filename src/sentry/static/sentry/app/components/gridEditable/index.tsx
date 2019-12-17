import React from 'react';

import {t} from 'app/locale';
import {openModal} from 'app/actionCreators/modal';

import EmptyStateWarning from 'app/components/emptyStateWarning';
import InlineSvg from 'app/components/inlineSvg';
import LoadingContainer from 'app/components/loading/loadingContainer';
import ToolTip from 'app/components/tooltip';

import {
  GridColumn,
  GridColumnHeader,
  GridColumnOrder,
  GridColumnSortBy,
  ObjectKey,
} from './types';
import GridHeadCell from './gridHeadCell';
import GridModalEditColumn from './gridModalEditColumn';
import {
  Header,
  HeaderTitle,
  HeaderButton,
  Body,
  Grid,
  GridRow,
  GridHead,
  GridBody,
  GridBodyCell,
  GridBodyCellSpan,
  GridBodyCellLoading,
  GridBodyErrorAlert,
  GridResizer,
} from './styles';
import {
  COL_WIDTH_MIN,
  COL_WIDTH_DEFAULT,
  COL_WIDTH_NUMBER,
  COL_WIDTH_STRING,
  COL_WIDTH_STRING_LONG,
  ColResizeMetadata,
} from './gridResizeUtils';

type GridEditableProps<DataRow, ColumnKey> = {
  onToggleEdit?: (nextValue: boolean) => void;

  gridHeadCellButtonProps?: {[prop: string]: any};

  isEditable?: boolean;
  isLoading?: boolean;
  isColumnDragging: boolean;
  error?: React.ReactNode | null;

  /**
   * GridEditable (mostly) do not maintain any internal state and relies on the
   * parent component to tell it how/what to render and will mutate the view
   * based on this 3 main props.
   *
   * - `columnOrder` determines the columns to show, from left to right
   * - `columnSortBy` is not used at the moment, however it might be better to
   *   move sorting into Grid for performance
   */
  title?: string;
  columnOrder: GridColumnOrder<ColumnKey>[];
  columnSortBy: GridColumnSortBy<ColumnKey>[];
  data: DataRow[];

  /**
   * GridEditable allows the parent component to determine how to display the
   * data within it. Note that this is optional.
   */
  grid: {
    renderHeaderCell?: (
      column: GridColumnOrder<ColumnKey>,
      columnIndex: number
    ) => React.ReactNode;
    renderBodyCell?: (
      column: GridColumnOrder<ColumnKey>,
      dataRow: DataRow
    ) => React.ReactNode;
    onResizeColumn?: (
      columnIndex: number,
      nextColumn: GridColumnOrder<ColumnKey>
    ) => void;
  };

  /**
   * As GridEditable is unopinionated about the structure of GridColumn,
   * ModalEditColumn relies on the parent component to provide the form layout
   * and logic to create/update the columns
   */
  modalEditColumn: {
    renderBodyWithForm: (
      indexColumnOrder?: number,
      column?: GridColumn<ColumnKey>,
      onSubmit?: (column: GridColumn<ColumnKey>) => void,
      onSuccess?: () => void,
      onError?: () => void
    ) => React.ReactNode;
    renderFooter: () => React.ReactNode;
  };

  /**
   * As there is no internal state being maintained, the parent component will
   * have to provide functions to update the state of the columns, especially
   * after moving/resizing
   */
  actions: {
    moveColumnCommit: (indexFrom: number, indexTo: number) => void;
    onDragStart: (
      event: React.MouseEvent<SVGSVGElement, MouseEvent>,
      indexFrom: number
    ) => void;
    deleteColumn: (index: number) => void;
  };
};

type GridEditableState = {
  isEditing: boolean;
  numColumn: number;

  isResizeActive: number;
  isResizeHover: number;
};

class GridEditable<
  DataRow extends {[key: string]: any},
  ColumnKey extends ObjectKey
> extends React.Component<GridEditableProps<DataRow, ColumnKey>, GridEditableState> {
  static defaultProps = {
    isEditable: false,
  };

  // Static methods do not allow the use of generics bounded to the parent class
  // For more info: https://github.com/microsoft/TypeScript/issues/14600
  static getDerivedStateFromProps(
    props: GridEditableProps<Object, keyof Object>,
    prevState: GridEditableState
  ): GridEditableState {
    return {
      ...prevState,
      numColumn: props.columnOrder.length,
    };
  }

  state = {
    numColumn: 0,
    isEditing: false,

    isResizeActive: -1,
    isResizeHover: -1,
  };

  componentWillUnmount() {
    this.clearWindowLifecycleEvents();
  }

  private refGrid = React.createRef<HTMLTableElement>();

  private resizeMetadata?: ColResizeMetadata;
  private resizeWindowLifecycleEvents: {
    [eventName: string]: any[];
  } = {
    mousemove: [],
    mouseup: [],
    cancelAnimationFrame: [],
  };

  onResizeMouseEnter = (columnIndex: number) => {
    this.setState({isResizeHover: columnIndex});
  };

  onResizeMouseLeave = () => {
    this.setState({isResizeHover: -1, isResizeActive: -1});
  };

  onResizeMouseDown = (e: React.MouseEvent, i: number) => {
    this.setState({isResizeActive: i});

    const cell = e.currentTarget && e.currentTarget.parentElement;
    if (!cell) {
      return;
    }

    this.resizeMetadata = {
      columnIndex: i,
      columnOffsetWidth: cell.offsetWidth,
      columnHtmlElement: cell,
      cursorX: e.clientX,
    };

    window.addEventListener('mousemove', this.onResizeMouseMove);
    this.resizeWindowLifecycleEvents.mousemove.push(this.onResizeMouseMove);

    window.addEventListener('mouseup', this.onResizeMouseUp);
    this.resizeWindowLifecycleEvents.mouseup.push(this.onResizeMouseUp);
  };

  onResizeMouseUp = () => {
    this.resizeMetadata = undefined;
    this.setState({isResizeActive: -1});
    this.clearWindowLifecycleEvents();
  };

  onResizeMouseMove = (e: MouseEvent) => {
    if (!this.resizeMetadata) {
      console.warn('failed to get resizeMeta');
      return;
    }

    const metadata = {...this.resizeMetadata};
    window.requestAnimationFrame(() => this.resizeGridColumn(e, metadata));
  };

  toggleEdit = () => {
    const nextValue = !this.state.isEditing;

    if (this.props.onToggleEdit) {
      this.props.onToggleEdit(nextValue);
    }

    this.setState({isEditing: nextValue});
  };

  /**
   * Leave `insertIndex` as undefined to add new column to the end.
   */
  openModalAddColumnAt = (insertIndex: number = -1) => {
    if (insertIndex < 0) {
      insertIndex = this.props.columnOrder.length;
    }

    return this.toggleModalEditColumn(insertIndex);
  };

  toggleModalEditColumn = (
    indexColumnOrder?: number,
    column?: GridColumn<ColumnKey>
  ): void => {
    const {modalEditColumn} = this.props;

    openModal(openModalProps => (
      <GridModalEditColumn
        {...openModalProps}
        indexColumnOrder={indexColumnOrder}
        column={column}
        renderBodyWithForm={modalEditColumn.renderBodyWithForm}
        renderFooter={modalEditColumn.renderFooter}
      />
    ));
  };

  clearWindowLifecycleEvents = () => {
    Object.keys(this.resizeWindowLifecycleEvents).forEach(e => {
      const callbacks = this.resizeWindowLifecycleEvents[e];

      if (e === 'cancelAnimationFrame') {
        callbacks.forEach(c => window.cancelAnimationFrame(c));
      } else {
        callbacks.forEach(c => window.removeEventListener(e, c));
      }

      this.resizeWindowLifecycleEvents[e] = [];
    });
  };

  /**
   *
   */
  resizeGridColumn = (e: MouseEvent, metadata: ColResizeMetadata) => {
    const grid = this.refGrid.current;
    if (!grid) {
      return;
    }

    const widthChange = e.clientX - metadata.cursorX;
    const templateCol = this.props.columnOrder.map(c =>
      c.width ? c.width : COL_WIDTH_DEFAULT
    );

    templateCol[metadata.columnIndex] = `${metadata.columnOffsetWidth + widthChange}px`;

    // Set the CSS for Grid Column
    grid.style.gridTemplateColumns = templateCol.join(' ');
  };

  renderHeaderButton = () => {
    if (!this.props.isEditable) {
      return null;
    }

    return (
      <HeaderButton onClick={() => this.openModalAddColumnAt()}>
        <InlineSvg src="icon-circle-add" />
        {t('Add Column')}
      </HeaderButton>
    );
  };

  renderGridHeadEditButtons = () => {
    if (!this.props.isEditable) {
      return null;
    }

    const sorryMessage = t('This will be improved soon! Please bear with us!');

    if (!this.state.isEditing) {
      return (
        <ToolTip title={sorryMessage}>
          <HeaderButton onClick={this.toggleEdit}>
            <InlineSvg src="icon-edit-pencil" />
            Edit Columns
          </HeaderButton>
        </ToolTip>
      );
    }

    return (
      <ToolTip title={sorryMessage}>
        <HeaderButton onClick={this.toggleEdit}>
          <InlineSvg src="icon-circle-close" />
          Exit Edit
        </HeaderButton>
      </ToolTip>
    );
  };

  renderGridHead = () => {
    const {columnOrder, actions, grid} = this.props;
    const {isEditing} = this.state;

    // Ensure that the last column cannot be removed
    const enableEdit = isEditing && columnOrder.length > 1;

    return (
      <GridHead>
        <GridRow>
          {columnOrder.map((column, i) => (
            <GridHeadCell
              openModalAddColumnAt={this.openModalAddColumnAt}
              isLast={columnOrder.length - 1 === i}
              key={`${i}.${column.key}`}
              isColumnDragging={this.props.isColumnDragging}
              isPrimary={column.isPrimary}
              isEditing={enableEdit}
              indexColumnOrder={i}
              column={column}
              gridHeadCellButtonProps={this.props.gridHeadCellButtonProps || {}}
              actions={{
                moveColumnCommit: actions.moveColumnCommit,
                onDragStart: actions.onDragStart,
                deleteColumn: actions.deleteColumn,
                toggleModalEditColumn: this.toggleModalEditColumn,
              }}
            >
              {grid.renderHeaderCell ? grid.renderHeaderCell(column, i) : column.name}
              {/* <GridResizer isHidden={i + 1 === columnOrder.length} /> */}
            </GridHeadCell>
          ))}
        </GridRow>
      </GridHead>
    );
  };

  renderGridBody = () => {
    const {data, error, isLoading} = this.props;

    if (error) {
      return this.renderError();
    }

    if (isLoading) {
      return this.renderLoading();
    }

    if (!data || data.length === 0) {
      return this.renderEmptyData();
    }

    return <GridBody>{data.map(this.renderGridBodyRow)}</GridBody>;
  };

  renderGridBodyRow = (dataRow: DataRow, row: number) => {
    const {columnOrder, grid} = this.props;
    const {isResizeActive, isResizeHover} = this.state;

    return (
      <GridRow key={row}>
        {columnOrder.map((col, i) => (
          <GridBodyCell key={`${col.key}${i}`}>
            {grid.renderBodyCell ? grid.renderBodyCell(col, dataRow) : dataRow[col.key]}
            <GridResizer
              isActive={i === isResizeActive}
              isHover={i === isResizeHover}
              onMouseEnter={() => this.onResizeMouseEnter(i)}
              onMouseLeave={() => this.onResizeMouseLeave()}
              onMouseDown={e => this.onResizeMouseDown(e, i)}
            />
          </GridBodyCell>
        ))}
      </GridRow>
    );
  };

  renderError = () => {
    const {error} = this.props;

    return (
      <GridBody>
        <GridRow>
          <GridBodyCellSpan>
            <GridBodyErrorAlert type="error" icon="icon-circle-exclamation">
              {error}
            </GridBodyErrorAlert>
          </GridBodyCellSpan>
        </GridRow>
      </GridBody>
    );
  };

  renderLoading = () => {
    return (
      <GridBody>
        <GridRow>
          <GridBodyCellSpan>
            <GridBodyCellLoading>
              <LoadingContainer isLoading />
            </GridBodyCellLoading>
          </GridBodyCellSpan>
        </GridRow>
      </GridBody>
    );
  };

  renderEmptyData = () => {
    return (
      <GridBody>
        <GridRow>
          <GridBodyCellSpan>
            <EmptyStateWarning>
              <p>{t('No results found')}</p>
            </EmptyStateWarning>
          </GridBodyCellSpan>
        </GridRow>
      </GridBody>
    );
  };

  render() {
    const {title, isEditable} = this.props;

    return (
      <React.Fragment>
        <Header>
          {/* TODO(leedongwei): Check with Bowen/Dora on what they want the
          default title to be */}
          <HeaderTitle>{title || 'Query Builder'}</HeaderTitle>

          {/* TODO(leedongwei): This is ugly but I need to move it to work on
          resizing columns. It will be refactored in a upcoming PR */}
          <div style={{display: 'flex', flexDirection: 'row'}}>
            {this.renderHeaderButton()}

            <div style={{marginLeft: '16px'}}>
              {isEditable && this.renderGridHeadEditButtons()}
            </div>
          </div>
        </Header>

        <Body>
          <Grid
            innerRef={this.refGrid}
            isEditable={this.props.isEditable}
            isEditing={this.state.isEditing}
            numColumn={this.state.numColumn}
          >
            {this.renderGridHead()}
            {this.renderGridBody()}
          </Grid>
        </Body>
      </React.Fragment>
    );
  }
}

export default GridEditable;
export {
  COL_WIDTH_MIN,
  COL_WIDTH_DEFAULT,
  COL_WIDTH_NUMBER,
  COL_WIDTH_STRING,
  COL_WIDTH_STRING_LONG,
  GridColumn,
  GridColumnHeader,
  GridColumnOrder,
  GridColumnSortBy,
  GridModalEditColumn,
};
