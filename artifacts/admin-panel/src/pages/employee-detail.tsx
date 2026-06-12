import { useRef, useState, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetEmployee, getGetEmployeeQueryKey,
  useTrainEmployee, useDeleteEmployee,
  useGetEmployeePhotoCount, getGetEmployeePhotoCountQueryKey,
  useUpdateEmployee
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Brain, Camera, CameraOff, Image, User, Trash2,
  ChevronLeft, CheckCircle2, Loader2, RefreshCw
} from "lucide-react";
import { Link } from "wouter";

export default function EmployeeDetail() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [capturedCount, setCapturedCount] = useState(0);

  const { data: employee, isLoading } = useGetEmployee(id, {
    query: { queryKey: getGetEmployeeQueryKey(id), enabled: !!id }
  });

  const { data: photoData, refetch: refetchCount } = useGetEmployeePhotoCount(id, {
    query: { queryKey: getGetEmployeePhotoCountQueryKey(id), enabled: !!id }
  });

  const trainMutation = useTrainEmployee();
  const deleteMutation = useDeleteEmployee();

  const photoCount = photoData?.count ?? 0;

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsCameraOn(true);
    } catch {
      toast({ title: "Camera Error", description: "Could not access camera.", variant: "destructive" });
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setIsCameraOn(false);
  };

  useEffect(() => () => { streamRef.current?.getTracks().forEach(t => t.stop()); }, []);

  const capturePhoto = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const token = localStorage.getItem("attendance_token");
      const formData = new FormData();
      formData.append("file", blob, "photo.jpg");
      try {
        const res = await fetch(`/api/employees/${id}/photos`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || "Failed to save photo");
        }
        setCapturedCount(c => c + 1);
        refetchCount();
      } catch (e: unknown) {
        toast({ title: "Capture Failed", description: e instanceof Error ? e.message : "No face detected", variant: "destructive" });
      }
    }, "image/jpeg", 0.85);
  }, [id, refetchCount, toast]);

  const autoCaptureLoop = useCallback(async () => {
    if (!isCameraOn) return;
    setCapturing(true);
    for (let i = 0; i < 20; i++) {
      await capturePhoto();
      await new Promise(r => setTimeout(r, 600));
    }
    setCapturing(false);
    toast({ title: "Capture Complete", description: "20 photos captured. You can now train the model." });
  }, [capturePhoto, isCameraOn, toast]);

  const handleTrain = () => {
    trainMutation.mutate({ id }, {
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: getGetEmployeeQueryKey(id) });
        toast({ title: result.success ? "Training Complete" : "Training Failed", description: result.message });
      },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Training failed";
        toast({ title: "Training Failed", description: msg, variant: "destructive" });
      }
    });
  };

  const handleDelete = () => {
    deleteMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Employee deleted" });
        setLocation("/employees");
      }
    });
  };

  if (isLoading) return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 gap-6">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );

  if (!employee) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-muted-foreground">Employee not found</p>
    </div>
  );

  const canTrain = photoCount >= 5;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/employees">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ChevronLeft className="w-4 h-4" /> Back
          </Button>
        </Link>
        <div className="flex-1">
          <h2 className="text-2xl font-bold">{employee.name}</h2>
          <p className="text-muted-foreground text-sm">{employee.employee_number} · {employee.department}</p>
        </div>
        <Badge
          className={employee.is_trained
            ? "bg-green-500/20 text-green-400 border-green-500/30 gap-1.5"
            : "gap-1.5"}
          variant={employee.is_trained ? "default" : "secondary"}
        >
          <Brain className="w-3 h-3" />
          {employee.is_trained ? "Model Trained" : "Not Trained"}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Employee Info */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <User className="w-4 h-4 text-primary" />
              Employee Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-2xl ring-2 ring-primary/20">
                {employee.name.charAt(0)}
              </div>
              <div>
                <p className="font-semibold">{employee.name}</p>
                <p className="text-sm text-muted-foreground">{employee.position}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ["ID", employee.employee_number],
                ["Department", employee.department],
                ["Position", employee.position],
                ["Photos Captured", String(photoCount)],
              ].map(([label, val]) => (
                <div key={label} className="bg-muted/30 rounded-md p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                  <p className="font-medium">{val}</p>
                </div>
              ))}
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                onClick={handleTrain}
                disabled={!canTrain || trainMutation.isPending}
                className="flex-1 gap-2"
                data-testid="button-train-employee"
              >
                {trainMutation.isPending
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Training...</>
                  : <><Brain className="w-4 h-4" /> {employee.is_trained ? "Retrain Model" : "Train Model"}</>}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                data-testid="button-delete-employee"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
            {!canTrain && (
              <p className="text-xs text-muted-foreground text-center">
                Capture at least 5 photos to enable training ({photoCount}/5)
              </p>
            )}
          </CardContent>
        </Card>

        {/* Camera Capture */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Image className="w-4 h-4 text-primary" />
              Face Capture
              <Badge variant="outline" className="ml-auto text-xs">{photoCount} photos</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                muted
                playsInline
                style={{ display: isCameraOn ? "block" : "none" }}
              />
              {!isCameraOn && (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Camera className="w-12 h-12 opacity-30" />
                  <p className="text-xs">Click "Start Camera" to capture photos</p>
                </div>
              )}
              {capturing && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <div className="text-center text-white">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                    <p className="text-sm">Auto-capturing... {capturedCount} done</p>
                  </div>
                </div>
              )}
              <canvas ref={canvasRef} className="hidden" />
            </div>

            <div className="flex gap-2">
              <Button
                variant={isCameraOn ? "destructive" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={isCameraOn ? stopCamera : startCamera}
                data-testid="button-toggle-capture-camera"
              >
                {isCameraOn ? <><CameraOff className="w-3.5 h-3.5" /> Stop</> : <><Camera className="w-3.5 h-3.5" /> Start Camera</>}
              </Button>
              {isCameraOn && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={capturePhoto}
                    disabled={capturing}
                    data-testid="button-capture-single"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Capture
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5 flex-1"
                    onClick={autoCaptureLoop}
                    disabled={capturing}
                    data-testid="button-auto-capture"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Auto (20 shots)
                  </Button>
                </>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Position face clearly in frame. System auto-detects and rejects blurry or faceless images.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
