<script lang="ts">
    import { SetDateInfinite, type BarChart, type LossBar } from "./bar"
    import BarScrollable from "./BarScrollable.svelte"
    import LineOrCandlestick from "./LineOrCandlestick.svelte"
    import MatureFilterSelector from "./MatureFilterSelector.svelte"
    import { getMemorisedDays } from "./MemorisedBar"
    import NoGraph from "./NoGraph.svelte"
    import { emptyBuckets, today, type Buckets } from "./revlogGraphs"
    import { catchErrors } from "./search"
    import { binSize, card_data, fatigueLoss, revlogs, searchLimit } from "./stores"
    import type { TrendInfo, TrendLine } from "./trend"
    import TrendValue from "./TrendValue.svelte"

    let show = false
    let retrievabilityDays: number[] | undefined = undefined
    let fatigueRMSEBuckets: Buckets<LossBar[]> = emptyBuckets(() => [])

    $: if ($revlogs && $card_data && show) {
        let data = catchErrors(() =>
            getMemorisedDays($revlogs, $card_data, SSEother.deck_configs, SSEother.deck_config_ids)
        )

        retrievabilityDays = Array.from(data.retrievabilityDays)
        $fatigueLoss = data.fatigueRMSE
    }

    $: truncated = $searchLimit !== 0
    $: label = (trend_data?.slope || 0) > 0 ? "memorised" : "forgotten"

    let trend_info: TrendInfo
    $: trend_info = {
        y: label,
        y_s: label,
        x: "day",
        x_s: "days",
        absolute: true,
    }

    let trend_data: TrendLine
</script>

{#if retrievabilityDays}
    <LineOrCandlestick data={retrievabilityDays} label="Cards" bind:trend_data />
    <TrendValue info={trend_info} trend={trend_data} n={$binSize} />
{:else if !show}
    <NoGraph faded={false}>
        {#if !truncated}
            <button class="big" on:click={() => (show = true)}>Show?</button>
        {:else}
            <button class="big" on:click={SetDateInfinite}>Increase date range</button>
            <button on:click={() => (show = true)}>Show?</button>
        {/if}
    </NoGraph>
{:else}
    <NoGraph>Loading</NoGraph>
{/if}

<style>
    .big {
        width: 100%;
        height: 100%;
    }
</style>
