<script lang="ts">
    import GraphContainer from "./GraphContainer.svelte"
    import IntervalGraph from "./IntervalGraph.svelte"
    import { catchErrors, type CardData, type Revlog } from "./search"
    import {
        binSize,
        burdenOrLoad,
        config,
        fatigueLoss,
        pieLast,
        pieSteps,
        scroll,
        searchLimit,
    } from "./stores"
    import _ from "lodash"
    import BarScrollable from "./BarScrollable.svelte"
    import type { PieDatum } from "./pie"
    import { MATURE_COLOUR, YOUNG_COLOUR } from "./graph"
    import Pie from "./Pie.svelte"
    import { barDateLabeler, barStringLabeler, type BarChart } from "./bar"
    import {
        calculateRevlogStats,
        day_ms,
        easeBarChart,
        today,
        type RevlogBuckets,
    } from "./revlogGraphs"
    import GraphCategory from "./GraphCategory.svelte"
    import Warning from "./Warning.svelte"
    import MatureFilterSelector from "./MatureFilterSelector.svelte"
    import TrendValue from "./TrendValue.svelte"
    import MemorisedBar from "./MemorisedBar.svelte"
    import { CANDLESTICK_GREEN, CANDLESTICK_RED, DeltaIfy } from "./Candlestick"
    import type { TrendLine } from "./trend"
    import LineOrCandlestick from "./LineOrCandlestick.svelte"

    export let revlogData: Revlog[]
    export let cardData: CardData[]
    export let addedCards: Record<number, number>

    $: ({
        day_initial_ease,
        day_initial_reintroduced_ease,
        day_ease,
        fatigue_ease,
        revlog_times,
        time_ease_seconds,
        sibling_time_ease,
        introduced_day_count,
        reintroduced_day_count,
        burden,
        day_forgotten,
        remaining_forgotten,
        intervals,
        interval_ease,
        review_intervals,
    } = catchErrors(() => calculateRevlogStats(revlogData, cardData)))

    $: burden_change = DeltaIfy(burden)
    $: realScroll = -Math.abs($scroll)
    const bins = 30
    $: start = today - bins * $binSize + realScroll

    $: burden_start = burden[start] ?? 0

    function barLabel(i: number) {
        return (i - today).toString()
    }

    $: introduced_bar = {
        row_colours: ["#13e0eb", "#0c8b91"],
        row_labels: ["Introduced", "Re-introduced"],
        data: Array.from(introduced_day_count)
            .map((v, i) => {
                const introduced = v ?? 0
                const reintroduced = reintroduced_day_count[i] ?? 0
                return {
                    values: [introduced - reintroduced, reintroduced],
                    label: barLabel(i),
                }
            })
            .map((d, i) => d ?? { values: [0, 0], label: barLabel(i) }),
        tick_spacing: 5,
        columnLabeler: barDateLabeler,
    }

    $: forgotten_bar = {
        row_colours: ["#330900"],
        row_labels: ["Forgotten"],
        data: Array.from(day_forgotten).map((v, i) => ({
            values: [v ?? 0],
            label: barLabel(i),
        })),
        tick_spacing: 5,
        columnLabeler: barDateLabeler,
    }

    $: time_machine_intervals = intervals[today + realScroll] ?? []
    $: time_machine_young = _.sum(time_machine_intervals.slice(0, 21)) || 0
    $: time_machine_mature = _.sum(time_machine_intervals.slice(21)) || 0
    $: time_machine_added = Object.entries(addedCards).reduce(
        (p, [i, v]) => p + (parseInt(i) <= realScroll ? v : 0),
        0
    )

    let left_bound_at = "Review"

    function minIndex(vals: Record<number, any>) {
        return _.min(Object.keys(vals).map((k) => parseInt(k))) ?? 0
    }

    $: review_leftmost = minIndex(intervals) - today
    $: added_leftmost = minIndex(addedCards)
    let custom_leftmost = 0

    $: time_machine_min = {
        Review: review_leftmost,
        Added: added_leftmost,
        Custom: -Math.abs(custom_leftmost),
    }[left_bound_at]

    let time_machine_pie: PieDatum[]
    $: time_machine_pie = [
        {
            label: "Mature",
            value: time_machine_mature,
            colour: MATURE_COLOUR,
        },
        {
            label: "Young",
            value: time_machine_young,
            colour: YOUNG_COLOUR,
        },
        {
            label: "New",
            value: time_machine_added - time_machine_young - time_machine_mature,
            colour: "#6baed6",
        },
    ]

    let time_machine_bar: BarChart
    $: time_machine_bar = {
        row_colours: ["#70AFD6"],
        row_labels: ["Cards"],
        data: Array.from(time_machine_intervals).map((v, i) => ({
            values: [v ?? 0],
            label: i.toString(),
        })),
        tick_spacing: 5,
        columnLabeler: barStringLabeler("Interval of $s"),
    }

    let review_no: number = 0
    let review_bar: BarChart
    let show_settled = false
    $: console.log({ review_intervals })
    $: review_bar = {
        row_colours: show_settled ? ["#70AFD6", "#0c8b91"] : ["#70AFD6"],
        row_labels: show_settled ? ["Active", "Settled"] : ["Cards"],
        data: Array.from(review_intervals[review_no] ?? []).map((v, i) => ({
            values: show_settled ? v : [(v ?? [0])[0]],
            label: i.toString(),
        })),
        tick_spacing: 5,
        columnLabeler: barStringLabeler("Interval of $s"),
    }

    let include_reintroduced = true
    $: truncated = $searchLimit !== 0
    $: introduced_ease = include_reintroduced ? day_initial_reintroduced_ease : day_initial_ease

    let normalize_ease = false
    $: limit = -1 - $searchLimit

    let mature_filter: keyof RevlogBuckets = "not_learn"

    let fatigue_bin_size = 10
    let interval_scroll = 1
    let interval_bin_size = 1

    let retention_trend = (values: number[]) => (_.sum(values) == 0 ? 0 : 1 - values[3])
    let burden_trend: TrendLine
</script>

<GraphCategory>
    <GraphContainer>
        <h1>Time Distribution</h1>
        <IntervalGraph
            intervals={revlog_times}
            bind:last={$pieLast}
            bind:steps={$pieSteps}
            include_suspended_option={false}
            pieInfo={{
                countDescriptor: "Most Seconds",
                spectrumFrom: "#fcba03",
                spectrumTo: "#543e00",
                fillerColour: "blue",
                legend_left: "Time (s)",
            }}
        ></IntervalGraph>
        <p>How many cards have taken the given amount of time to answer over every review</p>
        <p>
            In order to exclude suspended cards from this or the following graphs, you will need to
            manually add "-is:suspended" to your search. Please consider that this may cause
            inconsistencies if you leave it off for the above graphs.
        </p>
    </GraphContainer>
    <GraphContainer>
        <h1>Time Totals</h1>
        <IntervalGraph
            intervals={revlog_times.map((i, a) => i * a)}
            bind:last={$pieLast}
            bind:steps={$pieSteps}
            include_suspended_option={false}
            pieInfo={{
                countDescriptor: "Most Seconds",
                spectrumFrom: "#fcba03",
                spectrumTo: "#543e00",
                fillerColour: "blue",
                legend_left: "Per card (s)",
                legend_right: "Total (s)",
                totalDescriptor: "Seconds",
            }}
        ></IntervalGraph>
        <p>
            The quantity of time that has been spent on cards which have taken the given amount of
            time to answer over every review
        </p>
    </GraphContainer>
</GraphCategory>
<GraphCategory>
    <GraphContainer>
        <h1>Introduced</h1>
        <BarScrollable
            data={introduced_bar}
            {bins}
            bind:binSize={$binSize}
            bind:offset={$scroll}
            {limit}
        />
        <p>
            A card is introduced when it is shown to you for the first time. A card is re-introduced
            when it is shown to you for the first time after being forgotten.
        </p>
        {#if truncated}
            <Warning>
                Re-introduced does not work for cards introduced before the cutoff date.
            </Warning>
        {/if}
    </GraphContainer>
    <GraphContainer>
        <h1>Forgotten</h1>
        <BarScrollable
            data={forgotten_bar}
            {bins}
            bind:binSize={$binSize}
            bind:offset={$scroll}
            {limit}
        />
        <span>Forgotten cards not yet re-introduced: {remaining_forgotten.toLocaleString()}</span>

        <p>You "forget" a card when you manually mark it as new.</p>
        {#if truncated}
            <Warning>Does not work for cards introduced before the cutoff date.</Warning>
        {/if}
    </GraphContainer>
    <GraphContainer>
        <h1>Introductory Rating</h1>
        <BarScrollable
            data={easeBarChart(introduced_ease, today, normalize_ease, barDateLabeler)}
            bind:binSize={$binSize}
            bind:offset={$scroll}
            average={normalize_ease}
            trend={normalize_ease}
            trend_by={retention_trend}
            trend_info={{ y: "retention", y_s: "retention", x: "day", percentage: true }}
            {limit}
        />
        <label>
            <input type="checkbox" bind:checked={include_reintroduced} />
            Include re-introduced
        </label>
        <label>
            <input type="checkbox" bind:checked={normalize_ease} />
            As Ratio
        </label>
        <p>The first review you gave a newly introduced card. Important for FSRS.</p>
    </GraphContainer>
</GraphCategory>
<GraphCategory>
    <GraphContainer>
        <h1>{$burdenOrLoad} Trend</h1>
        <LineOrCandlestick
            data={burden}
            label={$burdenOrLoad}
            bind:trend_data={burden_trend}
            up_colour={CANDLESTICK_RED}
            down_colour={CANDLESTICK_GREEN}
        />
        <p>
            This shows the change in {$burdenOrLoad.toLowerCase()} over time. A green bar shows a decrease
            in {$burdenOrLoad.toLowerCase()} for that period of time (improvement) while a red bar shows
            an increase.
        </p>
        <TrendValue
            trend={burden_trend}
            n={$binSize}
            info={{ x: "day", y: "burden", y_s: "burden" }}
        />
        {#if truncated}
            <Warning>May be inaccurate while "all history" is not selected.</Warning>
        {/if}
    </GraphContainer>
    <GraphContainer>
        <h1>Ratings</h1>
        <BarScrollable
            data={easeBarChart(day_ease[mature_filter], today, normalize_ease, barDateLabeler)}
            bind:binSize={$binSize}
            bind:offset={$scroll}
            average={normalize_ease}
            trend={normalize_ease}
            trend_by={retention_trend}
            trend_info={{ y: "retention", y_s: "retention", x: "day", percentage: true }}
            {limit}
        />
        <label>
            <input type="checkbox" bind:checked={normalize_ease} />
            As Ratio
        </label>
        <MatureFilterSelector bind:group={mature_filter} />
        <p>
            The rating of every review you did that day, learning or otherwise. The ratio displays
            it as a percent of all cards reviewed that day. calculate <code>(1-again)%</code>
            to get your retention for that day (shown as "
            <code>% Correct</code>
            " in the tooltip).
        </p>
    </GraphContainer>
    <GraphContainer>
        <h1>Memorised</h1>
        <MemorisedBar />
        {#if truncated}
            <Warning>It is heavily advised you use "All history" for this graph</Warning>
            <Warning>
                This graph re-simulates your review history, leaving the beginning out can greatly
                affect the results.
            </Warning>
        {/if}
        <p>
            An FSRS estimate of how many cards you knew at that given time. This depends on FSRS's
            current parameters and will use the defaults if none are found (Even if you are using
            SM-2). <br />
            This graph will not work properly with an incomplete review history and will not respect
            "ignore reviews before".
            <br />
            <br />
            In FSRS, each card has a percentage chance of being recalled known as retrievability. This
            is a sum of those percentages over time.
            <br />
        </p>
    </GraphContainer>
</GraphCategory>
<GraphCategory>
    <GraphContainer>
        <h1>Interval Ratings</h1>
        <BarScrollable
            data={easeBarChart(
                interval_ease,
                1,
                normalize_ease,
                barStringLabeler("Interval of $s")
            )}
            bind:binSize={interval_bin_size}
            bind:offset={interval_scroll}
            average={normalize_ease}
            left_aligned
            trend={normalize_ease}
            trend_by={retention_trend}
            trend_info={{
                x: "day greater interval",
                x_s: "days greater interval",
                y: "retention",
                y_s: "retention",
                percentage: true,
            }}
        />
        <label>
            <input type="checkbox" bind:checked={normalize_ease} />
            As Ratio
        </label>
        <p>Ratings plotted by the interval they had before you rated them.</p>
    </GraphContainer>
    {#if $config?.badGraphs}
        <GraphContainer>
            <h1>Naive Sibling Similarity</h1>
            <BarScrollable
                data={easeBarChart(
                    sibling_time_ease,
                    1,
                    normalize_ease,
                    barStringLabeler("$s Days since sibling review")
                )}
                bind:binSize={interval_bin_size}
                bind:offset={interval_scroll}
                average={normalize_ease}
                left_aligned
                trend={normalize_ease}
                trend_by={retention_trend}
                trend_info={{
                    x: "day since last sibling review",
                    x_s: "days since last sibling review",
                    y: "retention",
                    y_s: "retention",
                    percentage: true,
                }}
            />
            <label>
                <input type="checkbox" bind:checked={normalize_ease} />
                As Ratio
            </label>
            <p>
                The rating you gave cards plotted by the number of days since you reviewed <b>
                    a sibling
                </b>
                of that card (card originating from the same note). Reviews from the same card or cards
                where either card are not mature are not counted. Please consider the "interval ratings"
                graph as you interpret this one.
            </p>
            <small><Warning always>Bad Graph</Warning></small>
        </GraphContainer>
        <GraphContainer>
            <h1>Rating Fatigue</h1>
            <BarScrollable
                data={easeBarChart(
                    fatigue_ease[mature_filter],
                    0,
                    normalize_ease,
                    barStringLabeler("$s Previous reviews")
                )}
                average={normalize_ease}
                bind:binSize={fatigue_bin_size}
                left_aligned
                trend={normalize_ease}
                trend_by={retention_trend}
                trend_info={{
                    x: "prior review that day",
                    x_s: "prior reviews that day",
                    y: "retention",
                    y_s: "retention",
                    percentage: true,
                }}
            />
            <label>
                <input type="checkbox" bind:checked={normalize_ease} />
                As Ratio
            </label>

            <MatureFilterSelector bind:group={mature_filter} />
            <p>
                Ratings plotted by how many reviews (that match the search) you did total in that
                day before rating them.
                <b>This will be affected by the card review/display order.</b>
            </p>
            <small><Warning always>Bad Graph</Warning></small>
        </GraphContainer>
        {#if $fatigueLoss}
            <GraphContainer>
                <h1>FSRS Loss by Fatigue</h1>
                <BarScrollable
                    bind:binSize={fatigue_bin_size}
                    data={{
                        row_colours: ["red"],
                        row_labels: ["RMSE"],
                        data: $fatigueLoss[mature_filter].map((v, i) => ({
                            label: i.toString(),
                            values: v,
                        })),
                    }}
                    left_aligned
                    average
                    loss
                    trend
                    trend_info={{
                        x: "prior review that day",
                        x_s: "prior reviews that day",
                        y: "loss",
                        y_s: "loss",
                    }}
                ></BarScrollable>
                <MatureFilterSelector bind:group={mature_filter}></MatureFilterSelector>
                <p>
                    This graph displays how inaccurate FSRS is by the number of reviews you did
                    prior in that day. <br />
                    Useful if you want to set a review limit.
                </p>
                <small><Warning always>Bad Graph</Warning></small>
            </GraphContainer>
        {/if}
    {/if}
    <GraphContainer>
        <h1>Time Ratings</h1>
        <BarScrollable
            data={easeBarChart(
                time_ease_seconds[mature_filter],
                0,
                normalize_ease,
                barStringLabeler("$s Seconds")
            )}
            average={normalize_ease}
            left_aligned
            trend={normalize_ease}
            trend_by={retention_trend}
            trend_info={{
                x: "second spent thinking",
                x_s: "seconds spent thinking",
                y: "retention",
                y_s: "retention",
                percentage: true,
            }}
        />
        <label>
            <input type="checkbox" bind:checked={normalize_ease} />
            As Ratio
        </label>

        <MatureFilterSelector bind:group={mature_filter} />
        <p>
            Ratings plotted by how long you spent looking at a card before rating it. Respects the
            deck presets "Maximum answer seconds" of the moment the answer was reviewed.
        </p>
    </GraphContainer>
</GraphCategory>
<GraphCategory>
    <GraphContainer>
        <h1>Card Count Time Machine</h1>
        <Pie data={time_machine_pie} legend_left={"Card Type"} legend_right={"Amount"} percentage
        ></Pie>
        <label>
            <span>
                {-realScroll} days ago:
            </span>
            <span class="scroll">
                {time_machine_min}
                <input type="range" min={time_machine_min} max={0} bind:value={$scroll} />
                0
            </span>
        </label>
        <div>
            Start at <br />
            <label>
                <input type="radio" bind:group={left_bound_at} value="Added" />
                First added
            </label>
            <label>
                <input type="radio" bind:group={left_bound_at} value="Review" />
                First review
            </label>
            <label>
                <input
                    type="radio"
                    bind:group={left_bound_at}
                    value="Custom"
                    on:click={() => {
                        if (time_machine_min) {
                            custom_leftmost = time_machine_min
                        }
                    }}
                />
                Custom
            </label>
            {#if left_bound_at == "Custom"}
                <input type="number" bind:value={custom_leftmost} />
            {/if}
        </div>
        <span>Total: {time_machine_added}</span>
        <p>Shows your card type counts for a given date</p>
        {#if truncated}
            <Warning>May be inaccurate while "all history" is not selected.</Warning>
        {/if}
    </GraphContainer>
    <GraphContainer>
        <h1>Review Interval Time Machine</h1>
        <BarScrollable data={time_machine_bar} left_aligned />
        <label class="scroll">
            <span>
                {new Date(Date.now() + $scroll * day_ms).toLocaleDateString()}:
            </span>
            <span class="scroll">
                {time_machine_min}
                <input type="range" min={time_machine_min} max={0} bind:value={$scroll} />
                0
            </span>
        </label>
        <p>Shows your review intervals for a given date</p>
        {#if truncated}
            <Warning>May be inaccurate while "all history" is not selected.</Warning>
        {/if}
    </GraphContainer>
</GraphCategory>
<GraphCategory>
    <GraphContainer>
        <h1>Interval By Previous Reviews</h1>
        <BarScrollable data={review_bar} left_aligned />
        <label class="scroll">
            <span style:width="3ch">
                {review_no + 1}:
            </span>
            <span class="scroll">
                1
                <input
                    type="range"
                    min={0}
                    max={review_intervals.length - 1}
                    bind:value={review_no}
                />
                {review_intervals.length}
            </span>
        </label>
        <label>
            <input type="checkbox" bind:checked={show_settled} />
            Show Settled
        </label>
        <p>
            Shows the intervals for cards when they had X number of previous reviews (intra-day
            reviews are not counted)
        </p>
        <p>
            <code>Show Settled</code>
            will also show cards which have less reviews than X
        </p>
        <span>
            Cards with {">"}
            {review_no - 1} reviews: {_.sumBy(review_intervals[review_no] ?? [], (b) =>
                b ? b[0] : 0
            )}
        </span>
        {#if truncated}
            <Warning>May be inaccurate while "all history" is not selected.</Warning>
        {/if}
    </GraphContainer>
</GraphCategory>

<style>
    label.scroll {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 0.5em 1em;
        align-items: baseline;
        width: 100%;
    }
    .scroll {
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 0.5em 1em;
    }
</style>
