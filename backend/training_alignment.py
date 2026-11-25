"""Apply one reference trial's lag to other trials without motion matching them."""

import math


def share_reference_result(result, reference, identities, unavailable=()):
    baseline = (reference["firstFrame"] - 1) / reference["pointRate"]
    accepted = (
        result.get("status") == "accepted"
        and isinstance(result.get("offset"), (int, float))
        and math.isfinite(result["offset"])
    )
    lag = float(result["offset"] - baseline) if accepted else None
    trials = []
    for acquisition in identities:
        is_reference = acquisition["id"] == reference["id"]
        trial_baseline = (acquisition["firstFrame"] - 1) / acquisition["pointRate"]
        trials.append(
            dict(
                acquisition=acquisition,
                status=("accepted" if is_reference else "shared") if accepted else "rejected",
                reason=("reference_match_found" if is_reference else "shared_from_reference")
                if accepted
                else "reference_not_matched",
                baseline=trial_baseline,
                lag=lag,
                offset=trial_baseline + lag if accepted else None,
                correlation=result.get("correlation") if is_reference else None,
                motionChecked=is_reference,
                referenceTrialId=reference["id"],
            )
        )
    return dict(
        status="accepted" if accepted else "rejected",
        reason="reference_lag_found" if accepted else "reference_not_matched",
        lag=lag,
        referenceTrial=reference,
        referenceResult=result,
        trials=trials + list(unavailable),
        candidates=[],
        model=result.get("model"),
        visualReview="pending",
        convention="video_pts_s = (vicon_original_frame - 1) / point_rate + shared_lag_s",
    )
