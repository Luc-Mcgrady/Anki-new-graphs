<script lang="ts">
    import _ from "lodash"
    import {
        limitArea,
        limit_area_width,
        type BarChart,
        type BarDatum,
        type ExtraRenderInput,
    } from "./bar"
    import Bar from "./Bar.svelte"
    import TrendValue from "./TrendValue.svelte"
    import { trendLine, type TrendInfo, type TrendLine } from "./trend"

    export let data: BarChart
    export let extraRender = (chart: ExtraRenderInput<BarChart>) => {}

    export let binSize = 1
    export let offset = 0
    export let bins = 30
    export let average = false
    export let left_aligned = false
    export let limit: number = -1
    export let trend = false
    export let trend_by: (values: number[]) => number = _.sum
    export let trend_info: TrendInfo = {}
    export let loss: boolean = false

    $: min = left_aligned ? 0 : 1
    $: absOffset = Math.abs(offset)
    $: realOffset = left_aligned ? absOffset + bins * binSize + min : -absOffset
    $: leftmost = realOffset - bins * binSize

    $: binSize = binSize > 0 ? binSize : 1
    $: seperate_bars = data.data.slice(
        leftmost,
        realOffset == 0 || realOffset >= data.data.length ? undefined : realOffset
    )

    export let trend_values: TrendLine = undefined

    function inner_extra_render(chart: ExtraRenderInput<BarChart>) {
        extraRender(chart)

        limitArea(chart, limit_area_width(chart.x, limit, offset, binSize, min, realOffset))

        const trend_data = chart.chart.data.map((datum) => ({
            x: parseInt(datum.label),
            y: trend_by(datum.values),
        }))

        if (trend) {
            trend_values = trendLine(chart, trend_data)
        } else {
            trend_values = undefined
        }
    }

    let bars: BarDatum[]
    $: {
        bars = _.range(leftmost, realOffset, binSize).map((i) => ({
            label: (i + min).toString(),
            values: loss ? [0, 0] : data.row_labels.map((_) => 0),
        }))

        for (const [i, bar] of seperate_bars.entries()) {
            const newIndex = Math.floor(i / binSize)

            bars[newIndex].values = bars[newIndex].values.map(
                (a, i) => a + (bar?.values ? bar?.values[i] || 0 : 0)
            )
        }

        if (average) {
            bars.map((bar, i) => {
                const count = seperate_bars
                    .slice(i * binSize, (i + 1) * binSize)
                    .reduce((p, n) => p + (_.sum(n.values) > 0 ? 1 : 0), 0)

                if (loss) {
                    bar.values = bar.values ? [Math.sqrt(bar.values[0] / bar.values[1])] : [0, 0]
                } else {
                    bar.values = bar.values.map((a) => a / (count || 1))
                }
            })
        }
    }
</script>

<div class="options">
    <label>
        Bar Width
        <input type="number" bind:value={binSize} />
    </label>
    <label>
        Scroll
        <input type="number" bind:value={offset} step={binSize} />
    </label>
</div>

<Bar data={{ ...data, data: bars, barWidth: binSize }} extraRender={inner_extra_render}></Bar>

{#if trend_values}
    <TrendValue trend={trend_values} n={binSize} info={trend_info} />
{/if}

<style>
    div.options {
        display: grid;
        grid-template-columns: auto 1fr auto 1fr;
        grid-template-areas: "a a b b";
        gap: 0.5em;
        align-items: baseline;
    }

    label {
        display: contents;
    }

    input {
        min-width: 5em;
    }
</style>
