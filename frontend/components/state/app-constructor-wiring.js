import { createSelectionHandlers } from '../shared/selection-handlers.js';
import { createRatingDragHandlers } from '../shared/rating-drag-handlers.js';
import { createHotspotHandlers, parseUtilityKeywordValue } from '../shared/hotspot-controls.js';

function initializeHotspotHandlers(host) {
  host._exploreHotspotHandlers = createHotspotHandlers(host, {
    targetsProperty: 'curateExploreTargets',
    dragTargetProperty: '_curateExploreHotspotDragTarget',
    nextIdProperty: '_curateExploreHotspotNextId',
    parseKeywordValue: parseUtilityKeywordValue,
    applyRating: (ids, rating) => host._applyExploreRating(ids, rating),
    processTagDrop: (ids, target) => host._processExploreTagDrop(ids, target),
    removeImages: (ids) => host._removeCurateImagesByIds(ids),
  });

  host._auditHotspotHandlers = createHotspotHandlers(host, {
    targetsProperty: 'curateAuditTargets',
    dragTargetProperty: '_curateAuditHotspotDragTarget',
    nextIdProperty: '_curateAuditHotspotNextId',
    parseKeywordValue: parseUtilityKeywordValue,
    applyRating: (ids, rating) => host._applyAuditRating(ids, rating),
    processTagDrop: (ids, target) => host._curateAuditState.processTagDrop(ids, target),
    removeImages: (ids) => host._removeAuditImagesByIds(ids),
  });
}

function initializeRatingHandlers(host) {
  host._exploreRatingHandlers = createRatingDragHandlers(host, {
    enabledProperty: 'curateExploreRatingEnabled',
    dragTargetProperty: '_curateExploreRatingDragTarget',
    showRatingDialog: (ids) => host._showExploreRatingDialog(ids),
  });

  host._auditRatingHandlers = createRatingDragHandlers(host, {
    enabledProperty: 'curateAuditRatingEnabled',
    dragTargetProperty: '_curateAuditRatingDragTarget',
    showRatingDialog: (ids) => host._showAuditRatingDialog(ids),
  });
}

function initializeSelectionHandlers(host) {
  host._exploreSelectionHandlers = createSelectionHandlers(host, {
    selectionProperty: 'curateDragSelection',
    selectingProperty: 'curateDragSelecting',
    startIndexProperty: 'curateDragStartIndex',
    endIndexProperty: 'curateDragEndIndex',
    pressActiveProperty: '_curatePressActive',
    pressStartProperty: '_curatePressStart',
    pressIndexProperty: '_curatePressIndex',
    pressImageIdProperty: '_curatePressImageId',
    pressTimerProperty: '_curatePressTimer',
    longPressTriggeredProperty: '_curateLongPressTriggered',
    getOrder: () => host._curateDragOrder || host._curateLeftOrder,
    flashSelection: (imageId) => host._flashCurateSelection(imageId),
  });

  host._auditSelectionHandlers = createSelectionHandlers(host, {
    selectionProperty: 'curateAuditDragSelection',
    selectingProperty: 'curateAuditDragSelecting',
    startIndexProperty: 'curateAuditDragStartIndex',
    endIndexProperty: 'curateAuditDragEndIndex',
    pressActiveProperty: '_curateAuditPressActive',
    pressStartProperty: '_curateAuditPressStart',
    pressIndexProperty: '_curateAuditPressIndex',
    pressImageIdProperty: '_curateAuditPressImageId',
    pressTimerProperty: '_curateAuditPressTimer',
    longPressTriggeredProperty: '_curateAuditLongPressTriggered',
    getOrder: () => host._curateAuditLeftOrder,
    flashSelection: (imageId) => host._flashCurateSelection(imageId),
  });
}

function wireFilterPanelListeners(host) {
  host.searchFilterPanel.on('images-loaded', (detail) => {
    if (detail.tabId === 'search') {
      host.searchImages = [...detail.images];
      host.searchTotal = detail.total || 0;
    }
  });

  host.curateHomeFilterPanel.on('images-loaded', (detail) => {
    if (detail.tabId === 'curate-home') {
      host.curateImages = [...detail.images];
      host.curateTotal = detail.total || 0;
    }
  });

  host.curateAuditFilterPanel.on('images-loaded', (detail) => {
    if (detail.tabId === 'curate-audit') {
      host.curateAuditImages = [...detail.images];
      host.curateAuditTotal = detail.total || 0;
    }
  });
}

function wireEventHandlers(host) {
  host._handleQueueCommandComplete = (event) =>
    host._appEventsState.handleQueueCommandComplete(event);
  host._handleQueueCommandFailed = (event) =>
    host._appEventsState.handleQueueCommandFailed(event);
  host._handleCurateGlobalPointerDown = (event) =>
    host._appEventsState.handleCurateGlobalPointerDown(event);
  host._handleCurateSelectionEnd = () =>
    host._appEventsState.handleCurateSelectionEnd();
}

export function initializeAppConstructorWiring(host) {
  initializeHotspotHandlers(host);
  initializeRatingHandlers(host);
  initializeSelectionHandlers(host);
  wireFilterPanelListeners(host);
  wireEventHandlers(host);
}
