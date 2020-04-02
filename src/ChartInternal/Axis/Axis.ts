/**
 * Copyright (c) 2017 ~ present NAVER Corp.
 * billboard.js project is licensed under the MIT license
 */
import {
	axisTop as d3AxisTop,
	axisBottom as d3AxisBottom,
	axisLeft as d3AxisLeft,
	axisRight as d3AxisRight
} from "d3-axis";
import {scaleLinear as d3ScaleLinear} from "d3-scale";
import AxisRenderer from "./AxisRenderer";
import CLASS from "../../config/classes";
import {capitalize, isArray, isFunction, isString, isValue, isEmpty, isNumber, isObjectType, mergeObj, notEmpty, parseDate, sortValue} from "../../module/util";

export default class Axis {
	public owner;

	public x;
	public subX;
	public y;
	public y2;

	private axesList = {};
	public tick = {
		x: null, y: null, y2: null
	};
	public xs = [];
	private orient = {
		x: "bottom",
		y: "left",
		y2: "right",
		subX: "bottom"
	};

	constructor(owner) {
		this.owner = owner;
		this.setOrient();
	}

	private getAxisClassName(id) {
		return `${CLASS.axis} ${CLASS[`axis${capitalize(id)}`]}`;
	}

	private isHorizontal($$, forHorizontal) {
		const isRotated = $$.config.axis_rotated;

		return forHorizontal ? isRotated : !isRotated;
	}

	public isCategorized() {
		const {config, state} = this.owner;

		return config.axis_x_type.indexOf("category") >= 0 || state.hasRadar;
	}

	public isCustomX() {
		const {config} = this.owner;

		return !this.isTimeSeries() && (config.data_x || notEmpty(config.data_xs));
	}

	public isTimeSeries(id = "x") {
		const {config} = this.owner;

		return config[`axis_${id}_type`] === "timeseries";
	}

	public isTimeSeriesY() {
		return this.isTimeSeries("y");
	}

	init() {
		const $$ = this.owner;
		const {config, $el: {main, axis}, state: {clip}} = $$;
		const isRotated = config.axis_rotated;
		const target = ["x", "y"];

		config.axis_y2_show && target.push("y2");

		target.forEach(v => {
			const classAxis = this.getAxisClassName(v);
			const classLabel = CLASS[`axis${v.toUpperCase()}Label`];

			axis[v] = main.append("g")
				.attr("class", classAxis)
				.attr("clip-path", () => {
					let res = null;

					if (v === "x") {
						res = clip.pathXAxis;
					} else if (v === "y" && config.axis_y_inner) {
						res = clip.pathYAxis;
					}

					return res;
				})
				.attr("transform", $$.getTranslate(v))
				.style("visibility", config[`axis_${v}_show`] ? "visible" : "hidden");

			axis[v].append("text")
				.attr("class", classLabel)
				.attr("transform", ["rotate(-90)", null][
					v === "x" ? +!isRotated : +isRotated
				])
				.style("text-anchor", () => this.textAnchorForAxisLabel(v));

			this.generateAxes(v);
		});
	}

	/**
	 * Set axis orient according option value
	 * @private
	 */
	setOrient() {
		const $$ = this.owner;
		const {
			axis_rotated: isRotated,
			axis_y_inner: yInner,
			axis_y2_inner: y2Inner
		} = $$.config;

		this.orient = {
			x: isRotated ? "left" : "bottom",
			y: isRotated ? (yInner ? "top" : "bottom") : (yInner ? "right" : "left"),
			y2: isRotated ? (y2Inner ? "bottom" : "top") : (y2Inner ? "left" : "right"),
			subX: isRotated ? "left" : "bottom"
		};
	}

	/**
	 * Generate axes
	 * It's used when axis' axes option is set
	 * @param {string} id Axis id
	 * @private
	 */
	generateAxes(id: string) {
		const $$ = this.owner;
		const {config} = $$;
		const axes: any[] = [];
		const axesConfig = config[`axis_${id}_axes`];
		const isRotated = config.axis_rotated;
		let d3Axis;

		if (id === "x") {
			d3Axis = isRotated ? d3AxisLeft : d3AxisBottom;
		} else if (id === "y") {
			d3Axis = isRotated ? d3AxisBottom : d3AxisLeft;
		} else if (id === "y2") {
			d3Axis = isRotated ? d3AxisTop : d3AxisRight;
		}

		if (axesConfig.length) {
			axesConfig.forEach(v => {
				const tick = v.tick || {};
				const scale = $$.scale[id].copy();

				v.domain && scale.domain(v.domain);

				axes.push(
					d3Axis(scale)
						.ticks(tick.count)
						.tickFormat(isFunction(tick.format) ? tick.format.bind($$.api) : ((x: any) => x))
						.tickValues(tick.values)
						.tickSizeOuter(tick.outer === false ? 0 : 6)
				);
			});
		}

		this.axesList[id] = axes;
	}

	/**
	 * Update axes nodes
	 * @private
	 */
	updateAxes() {
		const $$ = this.owner;
		const {config, $el: {main}} = $$;

		Object.keys(this.axesList).forEach(id => {
			const axesConfig = config[`axis_${id}_axes`];
			const scale = $$.scale[id].copy();
			const range = scale.range();

			this.axesList[id].forEach((v, i) => {
				const axisRange = v.scale().range();

				// adjust range value with the current
				// https://github.com/naver/billboard.js/issues/859
				if (!range.every((v, i) => v === axisRange[i])) {
					v.scale().range(range);
				}

				const className = `${this.getAxisClassName(id)}-${i + 1}`;
				let g = main.select(`.${className.replace(/\s/, ".")}`);

				if (g.empty()) {
					g = main.append("g")
						.attr("class", className)
						.style("visibility", config[`axis_${id}_show`] ? "visible" : "hidden")
						.call(v);
				} else {
					axesConfig[i].domain && scale.domain(axesConfig[i].domain);

					this.x.helper.transitionise(g)
						.call(v.scale(scale));
				}

				g.attr("transform", $$.getTranslate(id, i + 1));
			});
		});
	}

	/**
	 * Set Axis & tick values
	 * called from: updateScales()
	 * @param {string} id Axis id string
	 * @param {Array} args Arguments
	 * @private
	 */
	setAxis(id, ...args): void {
		if (id !== "subX") {
			this.tick[id] = this.getTickValues(id);
		}

		// @ts-ignore
		this[id] = this.getAxis(id, ...args);
	}

	// called from : getMaxTickWidth()
	getAxis(id, scale, outerTick, noTransition, noTickTextRotate): AxisRenderer {
		const $$ = this.owner;
		const {config} = $$;
		const isX = /^(x|subX)$/.test(id);
		const type = isX ? "x" : id;

		const isCategory = isX && this.isCategorized();
		const orient = this.orient[id];
		const tickTextRotate = noTickTextRotate ? 0 : $$.getAxisTickRotate(type);
		let tickFormat;

		if (isX) {
			tickFormat = $$.format.xAxisTick;
		} else {
			const fn = config[`axis_${id}_tick_format`];

			if (isFunction(fn)) {
				tickFormat = fn.bind($$.api);
			}
		}

		let tickValues = this.tick[type];

		const axisParams = mergeObj({
			outerTick,
			noTransition,
			config,
			id,
			tickTextRotate
		}, isX && {
			isCategory,
			tickMultiline: config.axis_x_tick_multiline,
			tickWidth: config.axis_x_tick_width,
			tickTitle: isCategory && config.axis_x_tick_tooltip && $$.api.categories(),
			orgXScale: $$.scale.x
		});

		if (!isX) {
			axisParams.tickStepSize = config[`axis_${type}_tick_stepSize`];
		}

		const axis = new AxisRenderer(axisParams)
			.scale((isX && $$.scale.zoom) || scale)
			.orient(orient);

		if (isX && this.isTimeSeries() && tickValues && !isFunction(tickValues)) {
			const fn = parseDate.bind($$);

			tickValues = tickValues.map(v => fn(v));
		} else if (!isX && this.isTimeSeriesY()) {
			// https://github.com/d3/d3/blob/master/CHANGES.md#time-intervals-d3-time
			axis.ticks(config.axis_y_tick_time_value);
			tickValues = null;
		}

		tickValues && axis.tickValues(tickValues);

		// Set tick
		axis.tickFormat(
			tickFormat || (
				!isX && ($$.isStackNormalized() && (x => `${x}%`))
			)
		);

		if (isCategory) {
			axis.tickCentered(config.axis_x_tick_centered);

			if (isEmpty(config.axis_x_tick_culling)) {
				config.axis_x_tick_culling = false;
			}
		}

		const tickCount = config[`axis_${type}_tick_count`];

		tickCount && axis.ticks(tickCount);

		return axis;
	}

	updateXAxisTickValues(targets, axis?): string[] {
		const $$ = this.owner;
		const {config} = $$;
		const fit = config.axis_x_tick_fit;
		const count = config.axis_x_tick_count;
		let values;

		if (fit || (count && fit)) {
			values = this.generateTickValues(
				$$.mapTargetsToUniqueXs(targets),
				count,
				this.isTimeSeries()
			);
		}

		if (axis) {
			axis.tickValues(values);
		} else if (this.x) {
			this.x.tickValues(values);
			this.subX && this.subX.tickValues(values);
		}

		return values;
	}

	getId(id: string): string {
		const {config, scale} = this.owner;
		let axis = config.data_axes[id];

		// when data.axes option has 'y2', but 'axis.y2.show=true' isn't set will return 'y'
		if (!axis || !scale[axis]) {
			axis = "y";
		}

		return axis;
	}

	getXAxisTickFormat(): Function {
		const $$ = this.owner;
		const {config, format} = $$;
		const tickFormat = config.axis_x_tick_format;
		const isTimeSeries = this.isTimeSeries();
		const isCategorized = this.isCategorized();
		let currFormat;

		if (tickFormat) {
			if (isFunction(tickFormat)) {
				currFormat = tickFormat.bind($$.api);
			} else if (isTimeSeries) {
				currFormat = date => (date ? format.axisTime(tickFormat)(date) : "");
			}
		} else {
			currFormat = isTimeSeries ? format.defaultAxisTime : (
				isCategorized ?
					$$.categoryName : v => (v < 0 ? v.toFixed(0) : v)
			);
		}

		return isFunction(currFormat) ? v =>
			currFormat.apply($$, isCategorized ?
				[v, $$.categoryName(v)] : [v]
			) : currFormat;
	}

	getTickValues(id: string) {
		const $$ = this.owner;
		const tickValues = $$.config[`axis_${id}_tick_values`];
		const axis = $$[`${id}Axis`];

		return (isFunction(tickValues) ? tickValues.call($$.api) : tickValues) ||
			(axis ? axis.tickValues() : undefined);
	}

	getLabelOptionByAxisId(id: string) {
		return this.owner.config[`axis_${id}_label`];
	}

	getLabelText(id: string) {
		const option = this.getLabelOptionByAxisId(id);

		return isString(option) ? option : (
			option ? option.text : null
		);
	}

	setLabelText(id: string, text: string) {
		const $$ = this.owner;
		const {config} = $$;
		const option = this.getLabelOptionByAxisId(id);

		if (isString(option)) {
			config[`axis_${id}_label`] = text;
		} else if (option) {
			option.text = text;
		}
	}

	getLabelPosition(id: string, defaultPosition) {
		const isRotated = this.owner.config.axis_rotated;
		const option = this.getLabelOptionByAxisId(id);
		const position = (isObjectType(option) && option.position) ?
			option.position : defaultPosition[+!isRotated];

		const has = v => !!~position.indexOf(v);

		return {
			isInner: has("inner"),
			isOuter: has("outer"),
			isLeft: has("left"),
			isCenter: has("center"),
			isRight: has("right"),
			isTop: has("top"),
			isMiddle: has("middle"),
			isBottom: has("bottom")
		};
	}

	getAxisLabelPosition(id: string) {
		return this.getLabelPosition(id, id === "x" ? ["inner-top", "inner-right"] : ["inner-right", "inner-top"]);
	}

	getLabelPositionById(id: string) {
		return this.getAxisLabelPosition(id);
	}

	xForAxisLabel(id: string) {
		const $$ = this.owner;
		const {state: {width, height}} = $$;
		const position = this.getAxisLabelPosition(id);
		let x = position.isMiddle ? -height / 2 : 0;

		if (this.isHorizontal($$, id !== "x")) {
			x = position.isLeft ? 0 : (
				position.isCenter ? width / 2 : width
			);
		} else if (position.isBottom) {
			x = -height;
		}

		return x;
	}

	dxForAxisLabel(id: string) {
		const $$ = this.owner;
		const position = this.getAxisLabelPosition(id);
		let dx = position.isBottom ? "0.5em" : "0";

		if (this.isHorizontal($$, id !== "x")) {
			dx = position.isLeft ? "0.5em" : (
				position.isRight ? "-0.5em" : "0"
			);
		} else if (position.isTop) {
			dx = "-0.5em";
		}

		return dx;
	}

	textAnchorForAxisLabel(id: string) {
		const $$ = this.owner;
		const position = this.getAxisLabelPosition(id);
		let anchor = position.isMiddle ? "middle" : "end";

		if (this.isHorizontal($$, id !== "x")) {
			anchor = position.isLeft ? "start" : (
				position.isCenter ? "middle" : "end"
			);
		} else if (position.isBottom) {
			anchor = "start";
		}

		return anchor;
	}

	dyForAxisLabel(id: string) {
		const $$ = this.owner;
		const {config} = $$;
		const isRotated = config.axis_rotated;
		const isInner = this.getAxisLabelPosition(id).isInner;
		const tickRotate = config[`axis_${id}_tick_rotate`] ? $$.getHorizontalAxisHeight(id) : 0;
		const maxTickWidth = this.getMaxTickWidth(id);
		let dy;

		if (id === "x") {
			const xHeight = config.axis_x_height;

			if (isRotated) {
				dy = isInner ? "1.2em" : -25 - maxTickWidth;
			} else if (isInner) {
				dy = "-0.5em";
			} else if (xHeight) {
				dy = xHeight - 10;
			} else if (tickRotate) {
				dy = tickRotate - 10;
			} else {
				dy = "3em";
			}
		} else {
			dy = {
				y: ["-0.5em", 10, "3em", "1.2em", 10],
				y2: ["1.2em", -20, "-2.2em", "-0.5em", 15]
			}[id];

			if (isRotated) {
				if (isInner) {
					dy = dy[0];
				} else if (tickRotate) {
					dy = tickRotate * (id === "y2" ? -1 : 1) - dy[1];
				} else {
					dy = dy[2];
				}
			} else {
				dy = isInner ?
					dy[3] : (
						dy[4] + (
							config[`axis_${id}_inner`] ? 0 : (maxTickWidth + dy[4])
						)
					) * (id === "y" ? -1 : 1);
			}
		}

		return dy;
	}

	getMaxTickWidth(id: string, withoutRecompute?: boolean): number {
		const $$ = this.owner;
		const {config, state, $el: {svg, chart}} = $$;
		const currentTickMax = state.currentMaxTickWidths[id];
		let maxWidth = 0;

		if (withoutRecompute || !config[`axis_${id}_show`] || $$.filterTargetsToShow().length === 0) {
			return currentTickMax.size;
		}

		if (svg) {
			const isYAxis = /^y2?$/.test(id);
			const targetsToShow = $$.filterTargetsToShow($$.data.targets);
			const scale = $$.scale[id].copy().domain($$[`get${isYAxis ? "Y" : "X"}Domain`](targetsToShow, id));
			const domain = scale.domain();

			// do not compute if domain is same
			if (domain[0] === domain[1] ||
				(isArray(currentTickMax.domain) && currentTickMax.domain[0] === currentTickMax.domain[1])
			) {
				return currentTickMax.size;
			} else {
				currentTickMax.domain = domain;
			}

			const axis = this.getAxis(id, scale, false, false, true);
			const tickCount = config[`axis_${id}_tick_count`];
			const tickValues = config[`axis_${id}_tick_values`];

			// Make to generate the final tick text to be rendered
			// https://github.com/naver/billboard.js/issues/920
			// Do not generate if 'tick values' option is given
			// https://github.com/naver/billboard.js/issues/1251
			if (!tickValues && tickCount) {
				axis.tickValues(
					this.generateTickValues(
						domain,
						tickCount,
						isYAxis ? this.isTimeSeriesY() : this.isTimeSeries()
					));
			}

			!isYAxis && this.updateXAxisTickValues(targetsToShow, axis);

			const dummy = chart.append("svg")
				.style("visibility", "hidden")
				.style("position", "fixed")
				.style("top", "0px")
				.style("left", "0px");

			axis.create(dummy);

			dummy.selectAll("text")
				.each(function(d, i) {
					const currentTextWidth = this.getBoundingClientRect().width;

					maxWidth = Math.max(maxWidth, currentTextWidth);
					// cache tick text width for getXAxisTickTextY2Overflow()
					if (id === "x") {
						currentTickMax.ticks[i] = currentTextWidth;
					}
				});

			dummy.remove();
		}

		if (maxWidth > 0) {
			currentTickMax.size = maxWidth;
		}

		return currentTickMax.size;
	}

	getXAxisTickTextY2Overflow(defaultPadding) {
		const $$ = this.owner;
		const {axis, config, state} = $$;
		const xAxisTickRotate = $$.getAxisTickRotate("x");
		const positiveRotation = xAxisTickRotate > 0 && xAxisTickRotate < 90;

		if ((axis.isCategorized() || axis.isTimeSeries()) &&
			config.axis_x_tick_fit &&
			!config.axis_x_tick_culling &&
			!config.axis_x_tick_multiline &&
			positiveRotation
		) {
			const widthWithoutCurrentPaddingLeft = state.currentWidth - $$.getCurrentPaddingLeft();
			const maxOverflow = this.getXAxisTickMaxOverflow(
				xAxisTickRotate, widthWithoutCurrentPaddingLeft - defaultPadding
			);
			const xAxisTickTextY2Overflow = Math.max(0, maxOverflow) +
				defaultPadding; // for display inconsistencies between browsers

			return Math.min(xAxisTickTextY2Overflow, widthWithoutCurrentPaddingLeft / 2);
		}

		return 0;
	}

	getXAxisTickMaxOverflow(xAxisTickRotate, widthWithoutCurrentPaddingLeft) {
		const $$ = this.owner;
		const {axis, config, state} = $$;
		const isTimeSeries = axis.isTimeSeries();

		const tickTextWidths = state.currentMaxTickWidths.x.ticks;
		const tickCount = tickTextWidths.length;
		const {left, right} = state.axis.x.padding;
		let maxOverflow = 0;

		const remaining = tickCount - (isTimeSeries && config.axis_x_tick_fit ? 0.5 : 0);

		for (let i = 0; i < tickCount; i++) {
			const tickIndex = i + 1;
			const rotatedTickTextWidth = Math.cos(Math.PI * xAxisTickRotate / 180) * tickTextWidths[i];
			const ticksBeforeTickText = tickIndex - (isTimeSeries ? 1 : 0.5) + left;

			// Skip ticks if there are no ticks before them
			if (ticksBeforeTickText <= 0) {
				continue;
			}

			const xAxisLengthWithoutTickTextWidth = widthWithoutCurrentPaddingLeft - rotatedTickTextWidth;
			const tickLength = xAxisLengthWithoutTickTextWidth / ticksBeforeTickText;
			const remainingTicks = remaining - tickIndex;

			const paddingRightLength = right * tickLength;
			const remainingTickWidth = (remainingTicks * tickLength) + paddingRightLength;
			const overflow = rotatedTickTextWidth - (tickLength / 2) - remainingTickWidth;

			maxOverflow = Math.max(maxOverflow, overflow);
		}

		let tickOffset = 0;

		if (!isTimeSeries) {
			const scale = d3ScaleLinear()
				.domain([
					left * -1,
					$$.getXDomainMax($$.data.targets) + 1 + right
				])
				.range([0, widthWithoutCurrentPaddingLeft - maxOverflow]);

			tickOffset = (Math.ceil((scale(1) - scale(0)) / 2));
		}

		return maxOverflow + tickOffset;
	}

	/**
	 * Get x Axis padding
	 * @param {number} tickCount Tick count
	 * @returns {object} Padding object values with 'left' & 'right' key
	 * @private
	 */
	getXAxisPadding(tickCount) {
		const $$ = this.owner;
		let padding = $$.config.axis_x_padding;

		if (isEmpty(padding)) {
			padding = {left: 0, right: 0};
		} else {
			padding.left = padding.left || 0;
			padding.right = padding.right || 0;
		}

		if ($$.axis.isTimeSeries()) {
			const firstX = +$$.getXDomainMin($$.data.targets);
			const lastX = +$$.getXDomainMax($$.data.targets);
			const timeDiff = lastX - firstX;

			const range = timeDiff + padding.left + padding.right;
			const relativeTickWidth = (timeDiff / tickCount) / range;

			const left = padding.left / range / relativeTickWidth || 0;
			const right = padding.right / range / relativeTickWidth || 0;

			padding = {left, right};
		}

		return padding;
	}


	updateLabels(withTransition) {
		const $$ = this.owner;
		const {main} = $$.$el;

		const labels = {
			x: main.select(`.${CLASS.axisX} .${CLASS.axisXLabel}`),
			y: main.select(`.${CLASS.axisY} .${CLASS.axisYLabel}`),
			y2: main.select(`.${CLASS.axisY2} .${CLASS.axisY2Label}`)
		};

		Object.keys(labels).filter(id => !labels[id].empty())
			.forEach(v => {
				const node = labels[v];

				(withTransition ? node.transition() : node)
					.attr("x", () => this.xForAxisLabel(v))
					.attr("dx", () => this.dxForAxisLabel(v))
					.attr("dy", () => this.dyForAxisLabel(v))
					.text(() => this.getLabelText(v));
			});
	}

	getPadding(padding, key, defaultValue, domainLength) {
		const p = isNumber(padding) ? padding : padding[key];

		if (!isValue(p)) {
			return defaultValue;
		}

		return this.convertPixelsToAxisPadding(p, domainLength);
	}

	convertPixelsToAxisPadding(pixels, domainLength) {
		const $$ = this.owner;
		const {config, state: {width, height}} = $$;
		const length = config.axis_rotated ? width : height;

		return domainLength * (pixels / length);
	}

	generateTickValues(values, tickCount, forTimeSeries) {
		let tickValues = values;
		let start;
		let end;
		let count;
		let interval;
		let i;
		let tickValue;

		if (tickCount) {
			const targetCount = isFunction(tickCount) ? tickCount() : tickCount;

			// compute ticks according to tickCount
			if (targetCount === 1) {
				tickValues = [values[0]];
			} else if (targetCount === 2) {
				tickValues = [values[0], values[values.length - 1]];
			} else if (targetCount > 2) {
				const isCategorized = this.isCategorized();

				count = targetCount - 2;
				start = values[0];
				end = values[values.length - 1];
				interval = (end - start) / (count + 1);

				// re-construct unique values
				tickValues = [start];

				for (i = 0; i < count; i++) {
					tickValue = +start + interval * (i + 1);
					tickValues.push(
						forTimeSeries ? new Date(tickValue) : (
							isCategorized ? Math.round(tickValue) : tickValue
						)
					);
				}

				tickValues.push(end);
			}
		}

		if (!forTimeSeries) {
			tickValues = tickValues.sort((a, b) => a - b);
		}

		return tickValues;
	}

	generateTransitions(duration) {
		const $$ = this.owner;
		const axis = $$.$el.axis;

		const [axisX, axisY, axisY2, axisSubX] = ["x", "y", "y2", "subX"]
			.map(v => {
				let ax = axis[v];

				if (ax && duration) {
					ax = ax.transition().duration(duration);
				}

				return ax;
			});

		return {axisX, axisY, axisY2, axisSubX};
	}

	redraw(transitions, isHidden, isInit) {
		const $$ = this.owner;
		const {config, $el} = $$;
		const opacity = isHidden ? "0" : "1";

		["x", "y", "y2", "subX"].forEach(id => {
			const axis = this[id];
			const $axis = $el.axis[id];

			if (axis && $axis) {
				if (!isInit) {
					axis.config.withoutTransition = !config.transition_duration;
				}

				$axis.style("opacity", opacity);
				axis.create(transitions[`axis${capitalize(id)}`]);
			}
		});

		this.updateAxes();
	}

	/**
	 * Redraw axis
	 * @param {Array} targetsToShow targets data to be shown
	 * @param {object} wth option object
	 * @param {d3.Transition} transitions Transition object
	 * @param {object} flow flow object
	 * @param {boolean} isInit called from initialization
	 * @private
	 */
	redrawAxis(targetsToShow, wth, transitions, flow, isInit: boolean): void {
		const $$ = this.owner;
		const {config, scale, $el} = $$;
		const hasZoom = !!scale.zoom;
		let xDomainForZoom;

		if (!hasZoom && this.isCategorized() && targetsToShow.length === 0) {
			scale.x.domain([0, $el.axis.x.selectAll(".tick").size()]);
		}

		if (scale.x && targetsToShow.length) {
			!hasZoom &&
				$$.updateXDomain(targetsToShow, wth.UpdateXDomain, wth.UpdateOrgXDomain, wth.TrimXDomain);

			if (!config.axis_x_tick_values) {
				this.updateXAxisTickValues(targetsToShow);
			}
		} else if (this.x) {
			this.x.tickValues([]);
			this.subX && this.subX.tickValues([]);
		}

		if (config.zoom_rescale && !flow) {
			xDomainForZoom = scale.x.orgDomain();
		}

		["y", "y2"].forEach(key => {
			const axisScale = scale[key];

			if (axisScale) {
				const tickValues = config[`axis_${key}_tick_values`];
				const tickCount = config[`axis_${key}_tick_count`];

				axisScale.domain($$.getYDomain(targetsToShow, key, xDomainForZoom));

				if (!tickValues && tickCount) {
					const axis = $$.axis[key];
					const domain = axisScale.domain();

					axis.tickValues(
						this.generateTickValues(
							domain,
							domain.every(v => v === 0) ? 1 : tickCount,
							this.isTimeSeriesY()
						)
					);
				}
			}
		});

		// axes
		this.redraw(transitions, $$.hasArcType(), isInit);

		// Update axis label
		this.updateLabels(wth.Transition);

		// show/hide if manual culling needed
		if ((wth.UpdateXDomain || wth.UpdateXAxis || wth.Y) && targetsToShow.length) {
			this.setCulling();
		}

		// Update sub domain
		if (wth.Y) {
			scale.subY && scale.subY.domain($$.getYDomain(targetsToShow, "y"));
			scale.subY2 && scale.subY2.domain($$.getYDomain(targetsToShow, "y2"));
		}
	}

	/**
	 * Set manual culling
	 * @private
	 */
	setCulling() {
		const $$ = this.owner;
		const {config, state: {clip, currentMaxTickWidths}, $el} = $$;

		["subX", "x", "y", "y2"].forEach(type => {
			const axis = $el.axis[type];

			// subchart x axis should be aligned with x axis culling
			const id = type === "subX" ? "x" : type;
			const toCull = config[`axis_${id}_tick_culling`];

			if (axis && toCull) {
				const tickText = axis.selectAll(".tick text");
				const tickValues = sortValue(tickText.data());
				const tickSize = tickValues.length;
				const cullingMax = config[`axis_${id}_tick_culling_max`];
				let intervalForCulling;

				if (tickSize) {
					for (let i = 1; i < tickSize; i++) {
						if (tickSize / i < cullingMax) {
							intervalForCulling = i;
							break;
						}
					}

					tickText.each(function(d) {
						this.style.display = tickValues.indexOf(d) % intervalForCulling ? "none" : "block";
					});
				} else {
					tickText.style("display", "block");
				}

				// set/unset x_axis_tick_clippath
				if (type === "x") {
					const clipPath = currentMaxTickWidths.x.clipPath ? clip.pathXAxisTickTexts : null;

					$el.svg.selectAll(`.${CLASS.axisX} .tick text`)
						.attr("clip-path", clipPath);
				}
			}
		});
	}
}
