import { FSRS } from "ts-fsrs"
import { day_ms } from "./revlogGraphs"
import type { CardData } from "./search"

export function calculateCardDataPies(
    cardData: CardData[],
    include_suspended: boolean,
    zero_inclusive: boolean
) {
    let lapses: number[] = []
    let repetitions: number[] = []
    let lapses_burden: number[] = []
    let repetitions_burden: number[] = []
    let target_R_days: number[] = []
    const days_elapsed = SSEother.days_elapsed

    for (const card of cardData ?? []) {
        if (include_suspended || card.queue !== -1) {
            if (card.reps > 0) {
                lapses[card.lapses] = (lapses[card.lapses] ?? 0) + 1
                repetitions[card.reps] = (repetitions[card.reps] ?? 0) + 1

                const burden = card.ivl > 0 ? 1 / card.ivl : 1

                lapses_burden[card.lapses] = (lapses_burden[card.lapses] ?? 0) + burden
                repetitions_burden[card.reps] = (repetitions_burden[card.reps] ?? 0) + burden

                const stability = JSON.parse(card.data).s
                if (stability) {
                    let due = card.due < 100_000 ? card.due - days_elapsed : 0
                    const target_R = FSRS.prototype.forgetting_curve(
                        card.ivl > 0 ? card.ivl : -card.ivl / day_ms,
                        stability
                    )
                    target_R_days[due] = (target_R_days[due] ?? 0) + target_R
                }
            }
        }
    }

    if (!zero_inclusive) {
        delete lapses[0]
        delete lapses_burden[0]
    }

    return { lapses, repetitions, lapses_burden, repetitions_burden, target_R_days }
}
