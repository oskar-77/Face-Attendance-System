import { useEffect, useRef, useState, useCallback } from "react";
import { useRecognizeFace, useGetTodayAttendance, getGetTodayAttendanceQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Camera, CameraOff, Wifi, WifiOff, User, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

interface DetectedFace {
  employee_id: number | null;
  name: string;
  confidence: number;
  bbox: [number, number, number, number];
}

function getCameraErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case "NotAllowedError":
        return "تم رفض الوصول إلى الكاميرا. يرجى السماح بالوصول من إعدادات المتصفح ثم إعادة المحاولة.";
      case "NotFoundError":
        return "لم يتم العثور على كاميرا متصلة بالجهاز.";
      case "NotReadableError":
        return "الكاميرا مستخدمة من تطبيق آخر. أغلق التطبيق الآخر وأعد المحاولة.";
      case "OverconstrainedError":
        return "لا تدعم الكاميرا الدقة المطلوبة.";
      case "SecurityError":
        return "يجب فتح التطبيق عبر HTTPS للوصول إلى الكاميرا. جرب فتح الرابط في تبويب جديد.";
      default:
        return `خطأ في الكاميرا: ${err.name} — ${err.message}`;
    }
  }
  return "تعذّر الوصول إلى الكاميرا. تأكد من أن المتصفح يدعم الكاميرا وأن الصفحة تعمل عبر HTTPS.";
}

export default function CameraPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPendingRef = useRef(false);
  const captureRef = useRef<() => void>(() => {});

  const [isStreaming, setIsStreaming] = useState(false);
  const [detectedFaces, setDetectedFaces] = useState<DetectedFace[]>([]);
  const [recognitionActive, setRecognitionActive] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const recognizeMutation = useRecognizeFace();
  const { data: todayAttendance } = useGetTodayAttendance({
    query: { queryKey: getGetTodayAttendanceQueryKey(), refetchInterval: 5000 }
  });

  const drawOverlay = useCallback((faces: DetectedFace[]) => {
    const overlay = overlayRef.current;
    const video = videoRef.current;
    if (!overlay || !video) return;

    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, overlay.width, overlay.height);
    for (const face of faces) {
      const [x, y, w, h] = face.bbox;
      const isKnown = face.employee_id !== null;
      ctx.strokeStyle = isKnown ? "#22c55e" : "#ef4444";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      const label = isKnown ? `${face.name} (${face.confidence}%)` : "Unknown";
      ctx.fillStyle = isKnown ? "rgba(34, 197, 94, 0.85)" : "rgba(239, 68, 68, 0.85)";
      ctx.fillRect(x, y - 24, ctx.measureText(label).width + 12, 24);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 13px sans-serif";
      ctx.fillText(label, x + 6, y - 6);
    }
  }, []);

  const captureAndRecognize = useCallback(() => {
    if (isPendingRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    const base64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];

    isPendingRef.current = true;
    recognizeMutation.mutate(
      { data: { image: base64 } },
      {
        onSuccess: (result) => {
          const faces = result.faces as DetectedFace[];
          setDetectedFaces(faces);
          setFrameCount(c => c + 1);
          if (result.attendance_recorded) {
            queryClient.invalidateQueries({ queryKey: getGetTodayAttendanceQueryKey() });
          }
          drawOverlay(faces);
        },
        onSettled: () => {
          isPendingRef.current = false;
        },
      }
    );
  }, [recognizeMutation, queryClient, drawOverlay]);

  useEffect(() => {
    captureRef.current = captureAndRecognize;
  }, [captureAndRecognize]);

  const startCamera = async () => {
    setCameraError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "متصفحك لا يدعم الوصول للكاميرا، أو الصفحة لا تعمل عبر HTTPS. جرب فتح التطبيق في تبويب مستقل."
      );
      return;
    }

    const attemptGetStream = async (constraints: MediaStreamConstraints) =>
      navigator.mediaDevices.getUserMedia(constraints);

    try {
      // Try with ideal constraints first, then fall back to bare `true`
      let stream: MediaStream;
      try {
        stream = await attemptGetStream({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch {
        stream = await attemptGetStream({ video: true });
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsStreaming(true);
    } catch (err) {
      setCameraError(getCameraErrorMessage(err));
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    isPendingRef.current = false;
    setIsStreaming(false);
    setRecognitionActive(false);
    setDetectedFaces([]);
    const overlay = overlayRef.current;
    if (overlay) {
      const ctx = overlay.getContext("2d");
      ctx?.clearRect(0, 0, overlay.width, overlay.height);
    }
  };

  const toggleRecognition = () => {
    if (recognitionActive) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      isPendingRef.current = false;
      setRecognitionActive(false);
    } else {
      intervalRef.current = setInterval(() => captureRef.current(), 2000);
      setRecognitionActive(true);
    }
  };

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const isSecureContext = typeof window !== "undefined" && window.isSecureContext;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Live Recognition</h2>
          <p className="text-muted-foreground mt-1">Real-time face detection and attendance recording</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`gap-1.5 ${recognitionActive ? "border-green-500/50 text-green-400" : "border-muted"}`}>
            {recognitionActive ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {recognitionActive ? "Recognition Active" : "Recognition Off"}
          </Badge>
          <Badge variant="outline" className="text-xs text-muted-foreground">
            {frameCount} frames analyzed
          </Badge>
        </div>
      </div>

      {!isSecureContext && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-yellow-500/40 bg-yellow-500/10 text-yellow-300">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold mb-1">الكاميرا تتطلب اتصالاً آمناً (HTTPS)</p>
            <p className="text-yellow-300/80">
              افتح التطبيق في تبويب مستقل عبر{" "}
              <a
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-medium hover:text-yellow-200"
              >
                هذا الرابط
              </a>{" "}
              لتفعيل الكاميرا.
            </p>
          </div>
        </div>
      )}

      {cameraError && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm">{cameraError}</p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-4">
          <Card className="bg-card/50 border-border/50 overflow-hidden">
            <CardContent className="p-0 relative">
              <div className="relative w-full bg-black aspect-video flex items-center justify-center">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                  style={{ display: isStreaming ? "block" : "none" }}
                />
                <canvas
                  ref={overlayRef}
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                  style={{ display: isStreaming ? "block" : "none" }}
                />
                {!isStreaming && (
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <Camera className="w-16 h-16 opacity-30" />
                    <p className="text-sm">Camera is offline</p>
                  </div>
                )}
              </div>
              <canvas ref={canvasRef} className="hidden" />
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button
              onClick={isStreaming ? stopCamera : startCamera}
              variant={isStreaming ? "destructive" : "default"}
              className="gap-2"
              data-testid="button-toggle-camera"
            >
              {isStreaming
                ? <><CameraOff className="w-4 h-4" /> Stop Camera</>
                : <><Camera className="w-4 h-4" /> Start Camera</>}
            </Button>
            {isStreaming && (
              <Button
                onClick={toggleRecognition}
                variant={recognitionActive ? "outline" : "default"}
                className={`gap-2 ${recognitionActive ? "border-green-500/50 text-green-400 hover:bg-green-500/10" : ""}`}
                data-testid="button-toggle-recognition"
              >
                {recognitionActive
                  ? <><WifiOff className="w-4 h-4" /> Stop Recognition</>
                  : <><Wifi className="w-4 h-4" /> Start Recognition</>}
              </Button>
            )}
          </div>

          {detectedFaces.length > 0 && (
            <Card className="bg-card/50 border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Detected Faces ({detectedFaces.length})</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 flex flex-wrap gap-2">
                {detectedFaces.map((f, i) => (
                  <Badge
                    key={i}
                    variant="outline"
                    className={f.employee_id ? "border-green-500/40 text-green-400" : "border-destructive/40 text-destructive"}
                  >
                    {f.name} {f.employee_id ? `· ${f.confidence}%` : ""}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                Present Today ({todayAttendance?.length ?? 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {!todayAttendance || todayAttendance.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">No check-ins recorded yet today</p>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                  {todayAttendance.map(record => (
                    <div
                      key={record.id}
                      className="flex items-center gap-2 p-2.5 rounded-md bg-muted/30 border border-border/30"
                      data-testid={`row-attendance-today-${record.id}`}
                    >
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                        {record.employee_name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{record.employee_name}</p>
                        <p className="text-[10px] text-muted-foreground">{record.department}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] font-mono text-primary">
                          {record.check_in ? format(new Date(record.check_in), "HH:mm") : "--:--"}
                        </p>
                        {record.check_out ? (
                          <p className="text-[10px] font-mono text-muted-foreground">
                            out {format(new Date(record.check_out), "HH:mm")}
                          </p>
                        ) : (
                          <span className="text-[10px] text-green-400">Active</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
