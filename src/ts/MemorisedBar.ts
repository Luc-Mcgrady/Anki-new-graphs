import _ from "lodash"
import {
    type Card,
    createEmptyCard,
    dateDiffInDays,
    type FSRS,
    fsrs as Fsrs,
    type FSRSState,
    FSRSVersion,
    generatorParameters,
} from "ts-fsrs"
import type { LossBar } from "./bar"
import type { DeckConfig } from "./config"
import { type Buckets, dayFromMs, emptyBuckets, IDify, rollover_ms, today } from "./revlogGraphs"
import type { CardData, Revlog } from "./search"

interface LossBin {
    real: number
    predicted: number
    count: number
}

export function getMemorisedDays(
    revlogs: Revlog[],
    cards: CardData[],
    configs: typeof SSEother.deck_configs,
    config_mapping: typeof SSEother.deck_config_ids
) {
    console.log(`ts-fsrs ${FSRSVersion}`)

    let deckFsrs: Record<number, FSRS> = {}
    let fsrsCards: Record<number, Card> = {}

    let cards_by_id = IDify(cards)

    function getFsrs(config: DeckConfig) {
        const id = config.id
        if (!deckFsrs[id]) {
            deckFsrs[id] = Fsrs(
                generatorParameters({
                    w: config.fsrsParams5 ? config.fsrsParams5 : config.fsrsWeights,
                    enable_fuzz: false,
                    enable_short_term: true,
                })
            )
        }
        return deckFsrs[id]
    }

    let retrievabilityDays: number[] = []
    function card_config(cid: number) {
        const card = cards_by_id[cid]
        if (!card) {
            return undefined
        }
        return configs[config_mapping[card.did]]
    }

    function forgetting_curve(fsrs: FSRS, s: number, from: number, to: number) {
        for (const day of _.range(from, to)) {
            const retrievability = fsrs.forgetting_curve(day - from, s)
            retrievabilityDays[day] = (retrievabilityDays[day] || 0) + retrievability
        }
    }

    let last_stability: number[] = []

    function incrementLoss(bin: LossBin | null, predicted: number, real: number) {
        bin ??= { predicted: 0, real: 0, count: 0 }

        bin.predicted = (bin.predicted || 0) + predicted
        bin.real = (bin.real || 0) + real
        bin.count = (bin.count || 0) + 1

        return bin
    }

    let fatigue_bins: Buckets<LossBin[]> = emptyBuckets(() => [])
    let today_so_far = 0
    let last_date = new Date()

    for (const revlog of revlogs) {
        const config = card_config(revlog.cid)
        if (!config) {
            continue
        }

        const grade = revlog.ease
        const new_card = !fsrsCards[revlog.cid]
        const now = new Date(revlog.id)
        const fsrs = getFsrs(config)
        //console.log({fsrs})
        let card = fsrsCards[revlog.cid] ?? createEmptyCard(new Date(revlog.cid))

        if (revlog.ivl == 0 && !new_card) {
            card = fsrs.forget(card, now).card
            fsrsCards[revlog.cid] = card
        }
        // set due date or reschedule
        if (grade == 0) {
            continue
        }
        // cram
        if (revlog.type == 3 && revlog.factor == 0) {
            continue
        }
        if (last_stability[revlog.cid]) {
            const previous = dayFromMs(card.last_review!.getTime())
            const stability = last_stability[revlog.cid]
            forgetting_curve(fsrs, stability, previous, dayFromMs(revlog.id))
        }

        //console.log(grade)
        let memoryState: FSRSState | null = null
        let elapsed = 0
        if (card.last_review) {
            memoryState = card.stability
                ? {
                      difficulty: card.difficulty,
                      stability: card.stability,
                  }
                : null
            const oldDate = new Date(card.last_review.getTime() - rollover_ms)
            oldDate.setHours(0, 0, 0, 0)
            const newDate = new Date(now.getTime() - rollover_ms)
            newDate.setHours(0, 0, 0, 0)
            elapsed = dateDiffInDays(oldDate, newDate)

            if (newDate.getTime() != last_date.getTime()) {
                today_so_far = 0
                last_date = newDate
            }

            const predicted = fsrs.forgetting_curve(elapsed, card.stability)
            const y = grade > 1 ? 1 : 0
            let card_type: LossBin[]

            fatigue_bins.all[today_so_far] = incrementLoss(
                fatigue_bins.all[today_so_far],
                predicted,
                y
            )
            if (elapsed >= 1) {
                fatigue_bins.not_learn[today_so_far] = incrementLoss(
                    fatigue_bins.not_learn[today_so_far],
                    predicted,
                    y
                )
                if (elapsed >= 21) {
                    card_type = fatigue_bins.mature
                } else {
                    card_type = fatigue_bins.young
                }
            } else {
                card_type = fatigue_bins.learn
            }
            card_type[today_so_far] = incrementLoss(card_type[today_so_far], predicted, y)

            today_so_far += 1
        }
        const newState = fsrs.next_state(memoryState, elapsed, grade)
        card.last_review = now
        card.stability = newState.stability
        card.difficulty = newState.difficulty
        last_stability[revlog.cid] = card.stability // To prevent "forget" affecting the forgetting curve

        fsrsCards[revlog.cid] = card
    }

    // console.log({ deckFsrs })

    let inaccurate_cids: any[] = []
    let accurate_cids: number[] = []

    for (const [cid, card] of Object.entries(fsrsCards)) {
        const num_cid = parseInt(cid)
        const previous = dayFromMs(card.last_review!.getTime())
        const fsrs = getFsrs(card_config(num_cid)!)
        forgetting_curve(fsrs, last_stability[num_cid], previous, today + 1)
        if (cards_by_id[num_cid].data && JSON.parse(cards_by_id[num_cid].data).s) {
            const expected = last_stability[num_cid]
            const actual = JSON.parse(cards_by_id[num_cid].data).s
            if (Math.abs(expected - actual) > 0.01) {
                inaccurate_cids.push({
                    cid: num_cid,
                    expected: expected.toFixed(2),
                    actual: actual.toFixed(2),
                })
            } else {
                accurate_cids.push(num_cid)
            }
        }
    }

    if (inaccurate_cids.length) {
        const mean_error = _.meanBy(inaccurate_cids, (a) =>
            Math.abs(a.expected - a.actual)
        ).toFixed(2)
        console.warn(
            `The stability of the following ${inaccurate_cids.length}/${inaccurate_cids.length + accurate_cids.length} cards differ between SSE and anki with a mean error of ${mean_error}:`,
            { inaccurate_cids, accurate_cids }
        )
    }

    const fatigueRMSE = _.mapValues(fatigue_bins, (bins) =>
        bins.map(
            ({ real, predicted, count }) =>
                [((real - predicted) / count) ** 2 * count, count] as LossBar
        )
    )

    return { retrievabilityDays, fatigueRMSE }
}
