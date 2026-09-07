"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, AlertTriangle, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import {
  cancelPostAction,
  createPostAction,
  publishDraftAction,
  saveDraftAction,
} from "@/lib/actions/posts";
import type { CreatePostPayload } from "@/lib/actions/posts";
import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PLATFORM_LABELS } from "@/lib/errors";
import { PLATFORMS, type Platform } from "@/lib/status";
import { formatDateTime, zonedTimeToUtc } from "@/lib/time";
import type { AccountSummary, DraftDetail } from "@/lib/domain/types";
import {
  captionLimitConstrainers,
  captionLimitFor,
} from "@/lib/validation/limits";
import {
  PlatformPicker,
  blocksMedia,
  type PlatformCompatibility,
} from "./platform-picker";
import { CaptionField } from "./caption-field";
import { ScheduleDialog, type ScheduleValue } from "./schedule-dialog";
import { MediaPreview } from "../media/media-preview";
import { MediaTabs } from "../media/media-tabs";
import { useMediaUpload } from "../media/use-media-upload";

const platformValueSchema = z.custom<Platform>(
  (value) => typeof value === "string" && PLATFORMS.includes(value as Platform),
  { message: "Unsupported platform." },
);

const mediaValueSchema = z.object({
  kind: z.enum(["upload", "url"]),
  storageKey: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  mediaType: z.enum(["image", "video"]),
  mimeType: z.string().min(1),
  fileSize: z.number().nonnegative().nullable(),
  width: z.number().nonnegative().nullable(),
  height: z.number().nonnegative().nullable(),
  duration: z.number().nonnegative().nullable(),
  fileName: z.string(),
  previewUrl: z.string().nullable(),
});

const composerSchema = z
  .object({
    caption: z.string(),
    platforms: z.array(platformValueSchema),
    media: mediaValueSchema.nullable(),
  })
  .superRefine((values, ctx) => {
    if (values.caption.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["caption"],
        message: "Write a caption before publishing.",
      });
    }

    if (!values.media) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["media"],
        message: "Add media before publishing.",
      });
    }

    if (values.platforms.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["platforms"],
        message: "Select at least one platform.",
      });
    }

    const limit = captionLimitFor(values.platforms);
    if (values.caption.length > limit) {
      const [first] = captionLimitConstrainers(values.platforms, limit);
      if (first) {
        const over = values.caption.length - limit;
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["caption"],
          message: `Caption is too long for ${PLATFORM_LABELS[first]}. Remove ${over.toLocaleString()} ${over === 1 ? "character" : "characters"}.`,
        });
      }
    }
  });

const draftComposerSchema = z
  .object({
    caption: z.string(),
    platforms: z.array(platformValueSchema),
    media: mediaValueSchema.nullable(),
  })
  .superRefine((values, ctx) => {
    if (values.platforms.length === 0) return;
    const limit = captionLimitFor(values.platforms);
    if (values.caption.length > limit) {
      const [first] = captionLimitConstrainers(values.platforms, limit);
      if (first) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["caption"],
          message: `Caption is too long for ${PLATFORM_LABELS[first]}.`,
        });
      }
    }
  });

type ComposerValues = z.infer<typeof composerSchema>;

const COMPATIBILITY_DEBOUNCE_MS = 400;

function toMediaPayload(
  media: NonNullable<ComposerValues["media"]>,
  storageKey: string,
): CreatePostPayload["media"] {
  const base = {
    storageKey,
    mediaType: media.mediaType,
    mimeType: media.mimeType,
    fileSize: media.fileSize,
    width: media.width,
    height: media.height,
    duration: media.duration,
  };

  return media.kind === "url"
    ? { kind: "url", sourceUrl: media.sourceUrl ?? "", ...base }
    : { kind: "upload", ...base };
}

export function CreatePostForm({
  accounts,
  defaultTimezone,
  mode = "create",
  draft,
}: {
  accounts: AccountSummary[];
  defaultTimezone: string;
  mode?: "create" | "draft";
  draft?: DraftDetail;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<"save" | "publish" | "schedule" | null>(
    null,
  );
  const [cancelling, setCancelling] = useState(false);
  const [activeSubmission, setActiveSubmission] =
    useState<AbortController | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [compatibility, setCompatibility] = useState<PlatformCompatibility>({});
  const [checking, setChecking] = useState(false);

  const {
    pending,
    progress,
    uploading,
    resolving,
    error: mediaError,
    selectFile,
    addFromUrl,
    persistPendingMedia,
    cancelPersistence,
    reset: resetUploader,
  } = useMediaUpload();

  const connectedPlatforms = useMemo(
    () =>
      accounts
        .filter((account) => account.status === "active")
        .map((account) => account.platform),
    [accounts],
  );

  const draftMedia = useMemo(() => {
    if (!draft?.media) return null;
    return {
      kind: draft.media.storageKey ? ("upload" as const) : ("url" as const),
      storageKey: draft.media.storageKey,
      sourceUrl: draft.media.sourceUrl,
      mimeType: draft.media.mimeType,
      fileName: "Saved media",
      previewUrl: draft.media.previewUrl,
      mediaType: draft.media.mediaType,
      fileSize: draft.media.fileSize,
      width: draft.media.width,
      height: draft.media.height,
      duration: draft.media.duration,
    };
  }, [draft]);

  const initialPlatforms = useMemo(
    () => (draft
      ? draft.platforms
          .map((target) => target.platform)
          .filter((platform) => connectedPlatforms.includes(platform))
      : connectedPlatforms),
    [connectedPlatforms, draft],
  );

  const form = useForm<ComposerValues>({
    resolver: zodResolver(mode === "draft" ? draftComposerSchema : composerSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: {
      caption: draft?.contentText ?? "",
      platforms: initialPlatforms,
      media: draftMedia,
    },
  });

  const {
    control,
    reset: resetForm,
    setValue,
    trigger,
    handleSubmit,
    getValues,
    formState: { errors },
  } = form;

  const watchedCaption = useWatch({ control, name: "caption" });
  const watchedPlatforms = useWatch({ control, name: "platforms" });
  const media = useWatch({ control, name: "media" }) ?? null;

  const caption = watchedCaption ?? "";
  const selectedPlatforms = useMemo(() => watchedPlatforms ?? [], [watchedPlatforms]);

  const [debouncedCaption, setDebouncedCaption] = useState(caption);
  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedCaption(caption),
      COMPATIBILITY_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [caption]);

  // Compatibility is resolved before scheduling: a platform that cannot take
  // this media is disabled, never allowed to fail later.
  useEffect(() => {
    if (!media?.storageKey || connectedPlatforms.length === 0) return;

    let cancelled = false;
    const controller = new AbortController();

    const timer = setTimeout(() => {
      setChecking(true);
      void (async () => {
        try {
          const response = await fetch("/api/media/compatibility", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              storageKey: media.storageKey,
              sourceUrl: media.sourceUrl,
              mediaType: media.mediaType,
              mimeType: media.mimeType,
              fileSize: media.fileSize,
              width: media.width,
              height: media.height,
              duration: media.duration,
              caption: debouncedCaption,
              platforms: connectedPlatforms,
            }),
          });

          if (!response.ok) {
            if (!cancelled) setChecking(false);
            return;
          }

          const payload = (await response.json()) as {
            results?: Array<{
              platform: Platform;
              ok: boolean;
              code?: string;
              message?: string;
            }>;
          };

          if (cancelled) return;

          const next: PlatformCompatibility = {};
          for (const result of payload.results ?? []) {
            next[result.platform] = {
              ok: result.ok,
              code: result.code,
              message: result.message,
            };
          }
          setCompatibility(next);
        } catch {
          // Aborted or unreachable: platforms keep their current state.
        } finally {
          if (!cancelled) setChecking(false);
        }
      })();
    }, COMPATIBILITY_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [media, debouncedCaption, connectedPlatforms]);

  const isBlocked = useCallback(
    (platform: Platform) => blocksMedia(compatibility[platform]),
    [compatibility],
  );

  // A platform that turned out to be incompatible cannot stay selected.
  useEffect(() => {
    if (!media) return;
    const remaining = selectedPlatforms.filter(
      (platform) => !isBlocked(platform),
    );
    if (remaining.length === selectedPlatforms.length) return;
    setValue("platforms", remaining, {
      shouldValidate: submitAttempted || errors.platforms !== undefined,
      shouldDirty: true,
    });
  }, [
    media,
    selectedPlatforms,
    isBlocked,
    setValue,
    submitAttempted,
    errors.platforms,
  ]);

  // Dropping the media restores the fastest path: every connected platform.
  useEffect(() => {
    if (media) return;
    const same =
      selectedPlatforms.length === connectedPlatforms.length &&
      connectedPlatforms.every((platform) =>
        selectedPlatforms.includes(platform),
      );
    if (same) return;
    setValue("platforms", connectedPlatforms, { shouldValidate: false });
  }, [media, selectedPlatforms, connectedPlatforms, setValue]);

  const selectablePlatforms = connectedPlatforms.filter(
    (platform) => !isBlocked(platform),
  );
  const effectivePlatforms = selectedPlatforms.filter((platform) =>
    selectablePlatforms.includes(platform),
  );

  const limit = captionLimitFor(effectivePlatforms);
  const captionOverflow = caption.length - limit;
  const hasMedia = media !== null;

  const noAccounts = connectedPlatforms.length === 0;
  const mediaUnsupported =
    hasMedia &&
    !checking &&
    connectedPlatforms.length > 0 &&
    connectedPlatforms.every((platform) => isBlocked(platform));

  const publishDisabledReason = noAccounts
    ? "Connect an account to publish."
    : !hasMedia
      ? "Add media to continue."
      : mediaUnsupported
        ? "No selected platform supports this media."
        : checking
          ? "Checking media…"
          : captionOverflow > 0
            ? "Caption is too long."
            : effectivePlatforms.length === 0
              ? "Select at least one platform."
              : caption.trim().length === 0
                ? "Write a caption to continue."
                : null;

  const submit = useCallback(
    (values: ComposerValues, schedule: ScheduleValue | null) => {
      if (!values.media) return;

      const cancellation = new AbortController();
      setActiveSubmission(cancellation);
      setCancelling(false);
      setServerError(null);
      startTransition(async () => {
        const persisted = await persistPendingMedia(values.media!);
        if (!persisted.ok || !persisted.media.storageKey) {
          if (cancellation.signal.aborted) {
            toast.success("Publishing cancelled.");
            setCancelling(false);
          }
          setActiveSubmission(null);
          setPendingAction(null);
          return;
        }

        const postMedia = persisted.media;
        const storageKey = postMedia.storageKey;
        if (!storageKey) {
          setActiveSubmission(null);
          setPendingAction(null);
          return;
        }
        setValue("media", postMedia, { shouldValidate: false });
        const payload = {
          contentText: values.caption,
          media: toMediaPayload(postMedia, storageKey),
          platforms: values.platforms,
          schedule,
        };
        const result = mode === "draft" && draft
          ? await publishDraftAction(draft.id, payload)
          : await createPostAction(payload);

        if (cancellation.signal.aborted) {
          if (result.ok && result.postId) {
            const cancelled = await cancelPostAction(result.postId);
            if (cancelled.ok) {
              toast.success("Publishing cancelled.");
            } else {
              setServerError(cancelled.message);
              toast.error(cancelled.message);
            }
          } else {
            toast.success("Publishing cancelled.");
          }
          setActiveSubmission(null);
          setCancelling(false);
          setPendingAction(null);
          return;
        }

        if (!result.ok) {
          setServerError(result.message);
          setActiveSubmission(null);
          setPendingAction(null);
          return;
        }

        if (schedule) {
          const instant = zonedTimeToUtc(
            schedule.date,
            schedule.time,
            schedule.timezone,
          );
          toast.success(
            `Post scheduled for ${formatDateTime(instant, schedule.timezone)}.`,
          );
          resetUploader();
          if (mode === "draft") {
            router.push("/drafts");
          } else {
            resetForm({ caption: "", platforms: connectedPlatforms, media: null });
          }
          setCompatibility({});
          setSubmitAttempted(false);
          setCancelling(false);
          setActiveSubmission(null);
          setPendingAction(null);
          return;
        }

        // Publishing happens in the background. Keep the composer open and
        // reset it so the user can create another post without leaving this page.
        toast.success("Post submitted. Track its status in History.");
        resetUploader();
        if (mode === "draft") {
          router.push("/drafts");
        } else {
          resetForm({ caption: "", platforms: connectedPlatforms, media: null });
        }
        setCompatibility({});
        setSubmitAttempted(false);
        setCancelling(false);
        setActiveSubmission(null);
        setPendingAction(null);
      });
    },
    [
      connectedPlatforms,
      draft,
      mode,
      persistPendingMedia,
      resetForm,
      resetUploader,
      router,
      setValue,
    ],
  );

  const saveDraft = useCallback(() => {
    const parsed = draftComposerSchema.safeParse(getValues());
    if (!parsed.success) {
      setSubmitAttempted(true);
      setServerError(parsed.error.issues[0]?.message ?? "Complete the draft fields.");
      return;
    }

    const cancellation = new AbortController();
    setActiveSubmission(cancellation);
    setCancelling(false);
    setServerError(null);
    setPendingAction("save");
    startTransition(async () => {
      let media = parsed.data.media;
      if (media) {
        const persisted = await persistPendingMedia(media);
        if (!persisted.ok || !persisted.media.storageKey) {
          setActiveSubmission(null);
          setPendingAction(null);
          return;
        }
        media = persisted.media;
        setValue("media", media, { shouldValidate: false });
      }

      const result = await saveDraftAction({
        postId: draft?.id,
        caption: parsed.data.caption,
        media: media ? toMediaPayload(media, media.storageKey as string) : null,
        platforms: parsed.data.platforms,
        timezone: draft?.timezone ?? defaultTimezone,
      });

      if (!result.ok) {
        setServerError(result.message);
        setActiveSubmission(null);
        setPendingAction(null);
        return;
      }

      toast.success("Draft saved.");
      setActiveSubmission(null);
      setPendingAction(null);
      router.push(`/drafts/${result.postId}`);
    });
  }, [defaultTimezone, draft, getValues, persistPendingMedia, router, setValue]);

  const cancelSubmit = useCallback(() => {
    if (!isPending && pendingAction === null) return;
    activeSubmission?.abort();
    setCancelling(true);
    cancelPersistence();
  }, [activeSubmission, cancelPersistence, isPending, pendingAction]);

  const onPublish = handleSubmit(
    (values) => {
      const valid = composerSchema.safeParse(values);
      if (!valid.success) {
        setServerError(valid.error.issues[0]?.message ?? "Complete the post before publishing.");
        setSubmitAttempted(true);
        return;
      }
      setPendingAction("publish");
      submit(valid.data, null);
    },
    () => setSubmitAttempted(true),
  );

  const onScheduleClick = handleSubmit(
    (values) => {
      const valid = composerSchema.safeParse(values);
      if (!valid.success) {
        setServerError(valid.error.issues[0]?.message ?? "Complete the post before scheduling.");
        setSubmitAttempted(true);
        return;
      }
      setServerError(null);
      setScheduleOpen(true);
    },
    () => setSubmitAttempted(true),
  );

  const confirmSchedule = useCallback(
    (schedule: ScheduleValue) => {
      void handleSubmit(
        (values) => {
          const valid = composerSchema.safeParse(values);
          if (!valid.success) {
            setServerError(valid.error.issues[0]?.message ?? "Complete the post before scheduling.");
            setSubmitAttempted(true);
            return;
          }
          setScheduleOpen(false);
          setPendingAction("schedule");
          submit(valid.data, schedule);
        },
        () => {
          setScheduleOpen(false);
          setSubmitAttempted(true);
        },
      )();
    },
    [handleSubmit, submit],
  );

  const handleFile = useCallback(
    async (file: File) => {
      setServerError(null);
      setCompatibility({});
      const result = await selectFile(file);
      if (!result.ok) return;
      setValue("media", result.media, {
        shouldValidate: submitAttempted,
        shouldDirty: true,
      });
    },
    [selectFile, setValue, submitAttempted],
  );

  const handleUrl = useCallback(
    async (url: string) => {
      setServerError(null);
      setCompatibility({});
      const result = await addFromUrl(url);
      if (!result.ok) return result.message;
      setValue("media", result.media, {
        shouldValidate: submitAttempted,
        shouldDirty: true,
      });
      return null;
    },
    [addFromUrl, setValue, submitAttempted],
  );

  const removeMedia = useCallback(() => {
    resetUploader();
    setCompatibility({});
    setValue("media", null, { shouldValidate: submitAttempted });
  }, [resetUploader, setValue, submitAttempted]);

  const togglePlatform = useCallback(
    (platform: Platform, checked: boolean) => {
      const next = checked
        ? [...selectedPlatforms, platform]
        : selectedPlatforms.filter((value) => value !== platform);

      setValue(
        "platforms",
        PLATFORMS.filter((candidate) => next.includes(candidate)),
        {
          shouldValidate: submitAttempted || errors.platforms !== undefined,
          shouldDirty: true,
        },
      );
    },
    [errors.platforms, selectedPlatforms, setValue, submitAttempted],
  );

  const captionError = errors.caption?.message;
  const mediaFieldError = errors.media?.message;
  const submitting = isPending || pendingAction !== null;

  return (
    <Card className="max-w-2xl rounded-lg p-4 shadow-none md:p-6">
      <form noValidate onSubmit={onPublish} className="space-y-6">
        {serverError ? (
          <Alert variant="destructive" className="border-destructive-border">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        ) : null}

        <CaptionField
          value={caption}
          limit={limit}
          platforms={effectivePlatforms}
          error={captionError}
          disabled={isPending}
          onChange={(value) =>
            setValue("caption", value, {
              shouldValidate: errors.caption !== undefined,
              shouldDirty: true,
            })
          }
          onBlur={() => void trigger("caption")}
        />

        <div
          role="group"
          aria-labelledby="media-label"
          className="space-y-2"
        >
          <Label id="media-label">Media</Label>

          {media ? (
            <>
              <MediaPreview
                item={media}
                uploading={uploading || resolving}
                progress={progress}
                onRemove={removeMedia}
              />
              {mediaError ? (
                <p className="text-xs text-destructive">{mediaError}</p>
              ) : null}
            </>
          ) : pending ? (
            <>
              <MediaPreview
                item={pending}
                uploading={uploading || resolving}
                progress={progress}
                onRemove={removeMedia}
              />
              {mediaError ? (
                <p className="text-xs text-destructive">{mediaError}</p>
              ) : null}
            </>
          ) : (
            <MediaTabs
              onFile={(file) => void handleFile(file)}
              onUrl={handleUrl}
              error={mediaError}
              disabled={isPending}
            />
          )}

          {mediaFieldError ? (
            <p className="text-xs text-destructive">{mediaFieldError}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label id="publish-to-label">
            Publish to{" "}
            <span className="text-destructive" aria-hidden="true">
              *
            </span>
            <span className="sr-only">(required)</span>
          </Label>

          {noAccounts ? (
            <Alert className="border-warning-border bg-warning-surface text-warning">
              <AlertTriangle aria-hidden="true" />
              <AlertDescription className="text-warning">
                Connect an account to publish.{" "}
                <Button
                  asChild
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-warning"
                >
                  <Link href="/connected-accounts">Connect account</Link>
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <PlatformPicker
              accounts={accounts}
              selected={selectedPlatforms}
              onToggle={togglePlatform}
              compatibility={compatibility}
              checking={checking}
              hasMedia={hasMedia}
              showMediaRequired={submitAttempted}
              disabled={isPending}
            />
          )}

          {errors.platforms ? (
            <p className="text-xs text-destructive">
              {errors.platforms.message}
            </p>
          ) : null}
        </div>

        {mediaUnsupported ? (
          <Alert className="border-warning-border bg-warning-surface text-warning">
            <AlertTriangle aria-hidden="true" />
            <AlertDescription className="text-warning">
              No selected platform supports this media. Try a different file.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-2">
          {publishDisabledReason ? (
            <p className="text-xs text-muted-foreground sm:text-right">
              {publishDisabledReason}
            </p>
          ) : null}

          <TooltipProvider>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {submitting ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full sm:h-9 sm:w-auto"
                  disabled={cancelling}
                  onClick={cancelSubmit}
                >
                  {cancelling ? (
                    <>
                      <Loader2
                        className="size-4 animate-spin"
                        aria-hidden="true"
                      />
                      Cancelling…
                    </>
                  ) : (
                    "Cancel"
                  )}
                </Button>
              ) : null}

              {!submitting ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full sm:h-9 sm:w-auto"
                    disabled={isPending}
                    onClick={saveDraft}
                  >
                    {pendingAction === "save" ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                        Saving…
                      </>
                    ) : (
                      "Save draft"
                    )}
                  </Button>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="w-full sm:w-auto">
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-11 w-full sm:h-9 sm:w-auto"
                          disabled={isPending || noAccounts || mediaUnsupported}
                          onClick={() => void onScheduleClick()}
                        >
                          {pendingAction === "schedule" ? (
                            <>
                              <Loader2
                                className="size-4 animate-spin"
                                aria-hidden="true"
                              />
                              Scheduling…
                            </>
                          ) : (
                            "Schedule"
                          )}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {noAccounts ? (
                      <TooltipContent>Connect an account to publish.</TooltipContent>
                    ) : mediaUnsupported ? (
                      <TooltipContent>
                        No selected platform supports this media.
                      </TooltipContent>
                    ) : null}
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="w-full sm:w-auto">
                        <Button
                          type="submit"
                          className="h-11 w-full sm:h-9 sm:w-auto"
                          disabled={isPending || publishDisabledReason !== null}
                        >
                          {pendingAction === "publish" ? (
                            <>
                              <Loader2
                                className="size-4 animate-spin"
                                aria-hidden="true"
                              />
                              Publishing…
                            </>
                          ) : (
                            "Publish now"
                          )}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {publishDisabledReason ? (
                      <TooltipContent>{publishDisabledReason}</TooltipContent>
                    ) : null}
                </Tooltip>
                </>
              ) : null}
            </div>
          </TooltipProvider>
        </div>
      </form>

      <ScheduleDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        defaultTimezone={defaultTimezone}
        pending={isPending && pendingAction === "schedule"}
        onConfirm={confirmSchedule}
      />
    </Card>
  );
}
