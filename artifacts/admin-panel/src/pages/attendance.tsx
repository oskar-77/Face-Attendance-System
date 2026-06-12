import { useState } from "react";
import { useListAttendance, getListAttendanceQueryKey, useManualCheckout } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { CalendarIcon, LogOut, ChevronLeft, ChevronRight } from "lucide-react";

export default function Attendance() {
  const [page, setPage] = useState(1);
  const [dateFilter, setDateFilter] = useState(format(new Date(), "yyyy-MM-dd"));
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const LIMIT = 20;

  const params = { date: dateFilter, page, limit: LIMIT };
  const { data, isLoading } = useListAttendance(params, {
    query: { queryKey: getListAttendanceQueryKey(params) }
  });

  const checkoutMutation = useManualCheckout();

  const handleCheckout = (id: number, name: string) => {
    checkoutMutation.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAttendanceQueryKey() });
        toast({ title: "Checked out", description: `${name} has been checked out.` });
      },
      onError: () => toast({ title: "Error", description: "Failed to check out.", variant: "destructive" })
    });
  };

  const totalPages = data ? Math.ceil(data.total / LIMIT) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Attendance Log</h2>
        <p className="text-muted-foreground mt-1">View and manage daily check-in/check-out records</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="date"
            value={dateFilter}
            onChange={e => { setDateFilter(e.target.value); setPage(1); }}
            className="pl-9 bg-card/50 w-48"
            data-testid="input-date-filter"
          />
        </div>
        {data && (
          <span className="text-sm text-muted-foreground">
            {data.total} records found
          </span>
        )}
      </div>

      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Employee</th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Department</th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Check In</th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Check Out</th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Duration</th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-6 py-4"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                  : data?.records?.length === 0
                  ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">
                        No records found for {dateFilter}
                      </td>
                    </tr>
                  )
                  : data?.records?.map(record => (
                    <tr key={record.id} className="hover:bg-muted/20 transition-colors" data-testid={`row-attendance-${record.id}`}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                            {record.employee_name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{record.employee_name}</p>
                            <p className="text-xs text-muted-foreground">{record.employee_number}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground text-sm">{record.department}</td>
                      <td className="px-6 py-4 text-sm font-mono text-muted-foreground">{record.date}</td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm text-primary">
                          {format(new Date(record.check_in), "HH:mm:ss")}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {record.check_out ? (
                          <span className="font-mono text-sm text-muted-foreground">
                            {format(new Date(record.check_out), "HH:mm:ss")}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {record.duration_minutes != null
                          ? `${Math.floor(record.duration_minutes / 60)}h ${record.duration_minutes % 60}m`
                          : "—"}
                      </td>
                      <td className="px-6 py-4">
                        <Badge
                          variant="outline"
                          className={record.check_out
                            ? "border-muted text-muted-foreground text-[10px]"
                            : "border-green-500/40 text-green-400 text-[10px]"}
                        >
                          {record.check_out ? "Completed" : "Active"}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        {!record.check_out && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => handleCheckout(record.id, record.employee_name)}
                            disabled={checkoutMutation.isPending}
                            data-testid={`button-checkout-${record.id}`}
                          >
                            <LogOut className="w-3 h-3" />
                            Checkout
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
