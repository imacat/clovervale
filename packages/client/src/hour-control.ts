// The Clovervale project.
// Copyright 2026 imacat.
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
//
// Authors:
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/23
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/hour-control The control of the settings panel that sets
 *   the time of day previewed, its hour shown on a 24-hour clock.
 */

import type GUI from 'lil-gui';

import { describeHour, parseHour } from './day-clock.ts';
import type { TimePreviewSettings } from './day-clock.ts';

/** The control of the hour previewed, as the panel shows it. */
export interface HourControl {
  /**
   * Names the control.
   *
   * @param {string} name - Its name.
   */
  readonly name: (name: string) => void;
}

/** The step of the hour, in hours: three minutes. */
const HOUR_STEP = 0.05;
/** The latest hour, the end of the day. */
const LAST_HOUR = 24;
/** The identifier of the name of the control, which labels its field. */
const NAME_ID = 'panel-hour-name';
/**
 * How far the mouse moves on the field, in pixels, before it tells
 * dragging the hour up and down from selecting text across.
 */
const DRAG_THRESHOLD = 5;
/**
 * How long after the last turn of the wheel over the slider the hour
 * counts as set, in milliseconds.
 */
const WHEEL_FINISH_DELAY = 400;

/**
 * Snaps an hour to the step of the control, and keeps it within the day.
 *
 * @param {number} hour - The hour.
 * @returns {number} The hour snapped, from 0 to 24.
 */
function snapHour(hour: number): number {
  const snapped: number = Number.parseFloat(
    (Math.round(hour / HOUR_STEP) * HOUR_STEP).toPrecision(15),
  );
  if (snapped < 0) {
    return 0;
  }
  return snapped > LAST_HOUR ? LAST_HOUR : snapped;
}

/**
 * Tells how many steps a key or a drag moves the hour by: ten with Shift
 * held, a tenth with Alt held, and one otherwise.
 *
 * @param {KeyboardEvent | MouseEvent} event - The key or the move.
 * @returns {number} The number of steps.
 */
function findStepCount(event: KeyboardEvent | MouseEvent): number {
  if (event.shiftKey) {
    return 10;
  }
  return event.altKey ? 0.1 : 1;
}

/**
 * Tells how many steps a turn of the wheel moves the hour by, up and to the
 * right counting forward.
 *
 * @param {WheelEvent} event - The turn of the wheel.
 * @returns {number} The number of steps.
 */
function measureWheel(event: WheelEvent): number {
  let { deltaX, deltaY } = event;
  // A notched wheel moves the hour a step a notch, as the arrow keys do,
  // even where the browser tells it in fractions.
  if (
    Math.floor(deltaY) !== deltaY &&
    'wheelDelta' in event &&
    typeof event.wheelDelta === 'number' &&
    event.wheelDelta !== 0
  ) {
    deltaX = 0;
    deltaY = -event.wheelDelta / 120;
  }
  return deltaX - deltaY;
}

/**
 * Adds the control of the hour previewed to the end of the panel: a slider
 * across the day beside a field that shows the hour as hours and minutes
 * on a 24-hour clock, such as `13:55`, and takes an hour typed so, or as a
 * whole hour alone.  The hour moves in steps of three minutes, from 0 to
 * 24, as the slider is dragged by the mouse or a finger, or turned by the
 * wheel, and as the field is dragged up and down by the mouse, stepped by
 * the up and down arrow keys, or turned by the wheel while it is being
 * typed in; Shift moves it ten steps at a time, and Alt a tenth of one.
 * Enter finishes typing.  The keys typed into the control are kept from
 * the game.
 *
 * @param {GUI} gui - The panel.
 * @param {TimePreviewSettings} preview - The time of day previewed, whose
 *   hour the control sets.
 * @param {() => void} finishChange - Called once the owner has finished
 *   changing the hour.
 * @returns {HourControl} The control.
 */
export function addHourControl(
  gui: GUI,
  preview: TimePreviewSettings,
  finishChange: () => void,
): HourControl {
  const row: HTMLDivElement = document.createElement('div');
  row.className = 'hour-control';
  const label: HTMLDivElement = document.createElement('div');
  label.className = 'hour-name';
  label.id = NAME_ID;
  const widget: HTMLDivElement = document.createElement('div');
  widget.className = 'hour-widget';
  const slider: HTMLDivElement = document.createElement('div');
  slider.className = 'hour-slider';
  const fill: HTMLDivElement = document.createElement('div');
  fill.className = 'hour-fill';
  slider.append(fill);
  const input: HTMLInputElement = document.createElement('input');
  input.className = 'hour-input';
  input.type = 'text';
  input.setAttribute('aria-labelledby', NAME_ID);
  widget.append(slider, input);
  row.append(label, widget);
  gui.$children.append(row);
  for (const type of ['keydown', 'keyup']) {
    row.addEventListener(type, (event: Event) => {
      event.stopPropagation();
    });
  }

  let isFocused = false;
  let isChanged = false;
  const showClock = (): void => {
    input.value = describeHour(preview.hour);
  };
  const showHour = (): void => {
    const share: number = Math.max(0, Math.min(preview.hour / LAST_HOUR, 1));
    fill.style.width = `${String(share * 100)}%`;
    if (!isFocused) {
      showClock();
    }
  };
  const setHour = (hour: number): void => {
    const next: number = snapHour(hour);
    if (next !== preview.hour) {
      preview.hour = next;
      isChanged = true;
      showHour();
    }
  };
  const stepHour = (steps: number): void => {
    setHour(preview.hour + steps * HOUR_STEP);
    showClock();
  };
  const finish = (): void => {
    if (isChanged) {
      finishChange();
    }
    isChanged = false;
  };
  const showDragging = (
    isActive: boolean,
    axis: 'horizontal' | 'vertical',
  ): void => {
    slider.classList.toggle('is-active', isActive);
    document.body.classList.toggle('is-dragging-hour', isActive);
    document.body.classList.toggle(`is-dragging-${axis}`, isActive);
  };
  const hasScrollBar = (): boolean => {
    const children: HTMLElement = gui.root.$children;
    return children.scrollHeight > children.clientHeight;
  };

  input.addEventListener('focus', () => {
    isFocused = true;
  });
  input.addEventListener('blur', () => {
    isFocused = false;
    showHour();
    finish();
  });
  input.addEventListener('input', () => {
    const hour: number | null = parseHour(input.value);
    if (hour !== null) {
      setHour(hour);
    }
  });
  input.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      input.blur();
    }
    if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
      event.preventDefault();
      const direction: number = event.code === 'ArrowUp' ? 1 : -1;
      stepHour(direction * findStepCount(event));
    }
  });
  input.addEventListener(
    'wheel',
    (event: WheelEvent) => {
      if (!isFocused) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      stepHour(measureWheel(event));
    },
    { passive: false },
  );

  // The mouse dragged up and down on the field moves the hour, and dragged
  // across it selects text.
  let isTestingDrag = false;
  let startX = 0;
  let startY = 0;
  let lastY = 0;
  let startHour = 0;
  let dragged = 0;
  const moveOnField = (event: MouseEvent): void => {
    if (isTestingDrag) {
      if (Math.abs(event.clientY - startY) > DRAG_THRESHOLD) {
        event.preventDefault();
        input.blur();
        isTestingDrag = false;
        showDragging(true, 'vertical');
      } else if (Math.abs(event.clientX - startX) > DRAG_THRESHOLD) {
        releaseField();
      }
    }
    if (!isTestingDrag) {
      dragged -= (event.clientY - lastY) * HOUR_STEP * findStepCount(event);
      if (startHour + dragged > LAST_HOUR) {
        dragged = LAST_HOUR - startHour;
      } else if (startHour + dragged < 0) {
        dragged = -startHour;
      }
      setHour(startHour + dragged);
    }
    lastY = event.clientY;
  };
  const releaseField = (): void => {
    showDragging(false, 'vertical');
    finish();
    window.removeEventListener('mousemove', moveOnField);
    window.removeEventListener('mouseup', releaseField);
  };
  input.addEventListener('mousedown', (event: MouseEvent) => {
    startX = event.clientX;
    startY = lastY = event.clientY;
    isTestingDrag = true;
    startHour = preview.hour;
    dragged = 0;
    window.addEventListener('mousemove', moveOnField);
    window.addEventListener('mouseup', releaseField);
  });

  // The slider sets the hour where it is pressed, by the mouse or a finger.
  const setHourAt = (clientX: number): void => {
    const box: DOMRect = slider.getBoundingClientRect();
    setHour(((clientX - box.left) / (box.right - box.left)) * LAST_HOUR);
  };
  const moveOnSlider = (event: MouseEvent): void => {
    setHourAt(event.clientX);
  };
  const releaseSlider = (): void => {
    finish();
    showDragging(false, 'horizontal');
    window.removeEventListener('mousemove', moveOnSlider);
    window.removeEventListener('mouseup', releaseSlider);
  };
  slider.addEventListener('mousedown', (event: MouseEvent) => {
    showDragging(true, 'horizontal');
    setHourAt(event.clientX);
    window.addEventListener('mousemove', moveOnSlider);
    window.addEventListener('mouseup', releaseSlider);
  });

  // A finger on a panel that scrolls slides the slider only once it moves
  // across rather than up or down.
  let isTestingScroll = false;
  let touchX = 0;
  let touchY = 0;
  const beginTouchDrag = (event: TouchEvent, touch: Touch): void => {
    event.preventDefault();
    showDragging(true, 'horizontal');
    setHourAt(touch.clientX);
    isTestingScroll = false;
  };
  const moveTouch = (event: TouchEvent): void => {
    const touch: Touch | null = event.touches.item(0);
    if (touch === null) {
      return;
    }
    if (!isTestingScroll) {
      event.preventDefault();
      setHourAt(touch.clientX);
    } else if (
      Math.abs(touch.clientX - touchX) > Math.abs(touch.clientY - touchY)
    ) {
      beginTouchDrag(event, touch);
    } else {
      removeTouchListeners();
    }
  };
  const endTouch = (): void => {
    finish();
    showDragging(false, 'horizontal');
    removeTouchListeners();
  };
  const removeTouchListeners = (): void => {
    window.removeEventListener('touchmove', moveTouch);
    window.removeEventListener('touchend', endTouch);
    window.removeEventListener('touchcancel', endTouch);
  };
  slider.addEventListener(
    'touchstart',
    (event: TouchEvent) => {
      const touch: Touch | null = event.touches.item(0);
      if (event.touches.length > 1 || touch === null) {
        return;
      }
      if (hasScrollBar()) {
        touchX = touch.clientX;
        touchY = touch.clientY;
        isTestingScroll = true;
      } else {
        beginTouchDrag(event, touch);
      }
      window.addEventListener('touchmove', moveTouch, { passive: false });
      window.addEventListener('touchend', endTouch);
      window.addEventListener('touchcancel', endTouch);
    },
    { passive: false },
  );

  // The wheel over the slider moves the hour, unless it would rather
  // scroll the panel.
  let wheelTimer = 0;
  slider.addEventListener(
    'wheel',
    (event: WheelEvent) => {
      const isVertical: boolean =
        Math.abs(event.deltaX) < Math.abs(event.deltaY);
      if (isVertical && hasScrollBar()) {
        return;
      }
      event.preventDefault();
      stepHour(measureWheel(event));
      window.clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(finish, WHEEL_FINISH_DELAY);
    },
    { passive: false },
  );

  showHour();
  return {
    name: (name: string): void => {
      label.textContent = name;
    },
  };
}
