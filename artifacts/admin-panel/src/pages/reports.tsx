import { useState } from "react";
import { useGetDailyReport, getGetDailyReportQueryKey, useGetMonthlyReport, getGetMonthlyReportQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { format } from "date-fns";
import { CalendarIcon, TrendingUp, Users, UserCheck, UserX } from "lucide-react";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6"];

export default function Reports() {
  const [dailyDate, setDailyDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [reportMonth, setReportMonth] = useState(new Date().getMonth() + 1);
  const [reportYear, setReportYear] = useState(new Date().getFullYear());

  const dailyParams = { date: dailyDate };
  const { data: daily, isLoading: dailyLoading } = useGetDailyReport(dailyParams, {
    query: { queryKey: getGetDailyReportQueryKey(dailyParams) }
  });

  const monthlyParams = { month: reportMonth, year: reportYear };
  const { data: monthly, isLoading: monthlyLoading } = useGetMonthlyReport(monthlyParams, {
    query: { queryKey: getGetMonthlyReportQueryKey(monthlyParams) }
  });

  const dailyPieData = daily ? [
    { name: "Present", value: daily.present },
    { name: "Absent", value: daily.absent },
    { name: "Late", value: daily.late },
  ].filter(d => d.value > 0) : [];

  const monthlyBarData = monthly?.by_employee?.slice(0, 10).map(e => ({
    name: e.name.split(" ")[0],
    present: e.days_present,
    absent: e.days_absent,
    rate: e.attendance_rate,
  })) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Reports</h2>
        <p className="text-muted-foreground mt-1">Attendance analytics and workforce insights</p>
      </div>

      <Tabs defaultValue="daily">
        <TabsList className="bg-card/50 border border-border/50">
          <TabsTrigger value="daily">Daily Report</TabsTrigger>
          <TabsTrigger value="monthly">Monthly Report</TabsTrigger>
        </TabsList>

        <TabsContent value="daily" className="space-y-6 mt-6">
          <div className="flex items-center gap-3">
            <div className="relative">
              <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="date"
                value={dailyDate}
                onChange={e => setDailyDate(e.target.value)}
                className="pl-9 bg-card/50 w-48"
                data-testid="input-daily-date"
              />
            </div>
          </div>

          {dailyLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1,2,3].map(i => <Skeleton key={i} className="h-28" />)}
            </div>
          ) : daily && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                  { label: "Total Employees", value: daily.total_employees, icon: Users, color: "text-muted-foreground" },
                  { label: "Present", value: daily.present, icon: UserCheck, color: "text-green-400" },
                  { label: "Absent", value: daily.absent, icon: UserX, color: "text-destructive" },
                  { label: "Late Arrivals", value: daily.late, icon: TrendingUp, color: "text-yellow-400" },
                ].map(stat => (
                  <Card key={stat.label} className="bg-card/50 border-border/50">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-xs font-medium text-muted-foreground">{stat.label}</CardTitle>
                      <stat.icon className={`w-4 h-4 ${stat.color}`} />
                    </CardHeader>
                    <CardContent>
                      <div className={`text-3xl font-bold ${stat.color}`}>{stat.value}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {dailyPieData.length > 0 && (
                  <Card className="bg-card/50 border-border/50">
                    <CardHeader>
                      <CardTitle className="text-sm font-medium">Attendance Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie data={dailyPieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                            {dailyPieData.map((_, i) => (
                              <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                <Card className="bg-card/50 border-border/50">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Attendance Records ({daily.records.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="max-h-64 overflow-y-auto">
                      {daily.records.length === 0 ? (
                        <p className="text-center text-muted-foreground text-sm py-8">No records for this date</p>
                      ) : daily.records.map(r => (
                        <div key={r.id} className="flex items-center justify-between px-5 py-3 border-b border-border/30 last:border-0">
                          <div>
                            <p className="text-sm font-medium">{r.employee_name}</p>
                            <p className="text-xs text-muted-foreground">{r.department}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-mono text-primary">{format(new Date(r.check_in), "HH:mm")}</p>
                            {r.check_out && <p className="text-xs font-mono text-muted-foreground">{format(new Date(r.check_out), "HH:mm")}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="monthly" className="space-y-6 mt-6">
          <div className="flex items-center gap-3">
            <Select value={String(reportMonth)} onValueChange={v => setReportMonth(Number(v))}>
              <SelectTrigger className="w-40 bg-card/50" data-testid="select-month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(reportYear)} onValueChange={v => setReportYear(Number(v))}>
              <SelectTrigger className="w-28 bg-card/50" data-testid="select-year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2023, 2024, 2025, 2026].map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {monthlyLoading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1,2,3,4].map(i => <Skeleton key={i} className="h-28" />)}
              </div>
              <Skeleton className="h-64 w-full" />
            </div>
          ) : monthly && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Working Days", value: monthly.summary.working_days },
                  { label: "Total Check-ins", value: monthly.summary.total_checkins },
                  { label: "Avg Attendance", value: `${monthly.summary.avg_attendance_rate}%` },
                  { label: "Total Days", value: monthly.summary.total_days },
                ].map(stat => (
                  <Card key={stat.label} className="bg-card/50 border-border/50">
                    <CardContent className="pt-5">
                      <p className="text-xs text-muted-foreground mb-1">{stat.label}</p>
                      <p className="text-2xl font-bold">{stat.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {monthlyBarData.length > 0 && (
                <Card className="bg-card/50 border-border/50">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Days Present by Employee (Top 10)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={monthlyBarData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }} />
                        <Bar dataKey="present" fill="#6366f1" name="Days Present" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="absent" fill="#ef4444" name="Days Absent" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              <Card className="bg-card/50 border-border/50">
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Employee Summary</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 border-b border-border">
                      <tr>
                        <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Employee</th>
                        <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Dept</th>
                        <th className="px-5 py-3 text-center text-xs font-medium text-muted-foreground uppercase">Present</th>
                        <th className="px-5 py-3 text-center text-xs font-medium text-muted-foreground uppercase">Absent</th>
                        <th className="px-5 py-3 text-center text-xs font-medium text-muted-foreground uppercase">Avg Hours</th>
                        <th className="px-5 py-3 text-center text-xs font-medium text-muted-foreground uppercase">Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {monthly.by_employee.map(emp => (
                        <tr key={emp.employee_id} className="hover:bg-muted/20">
                          <td className="px-5 py-3 font-medium">{emp.name}</td>
                          <td className="px-5 py-3 text-muted-foreground text-xs">{emp.department}</td>
                          <td className="px-5 py-3 text-center text-green-400">{emp.days_present}</td>
                          <td className="px-5 py-3 text-center text-destructive">{emp.days_absent}</td>
                          <td className="px-5 py-3 text-center text-muted-foreground">{emp.avg_work_hours}h</td>
                          <td className="px-5 py-3 text-center">
                            <Badge
                              variant="outline"
                              className={emp.attendance_rate >= 80
                                ? "border-green-500/40 text-green-400 text-[10px]"
                                : emp.attendance_rate >= 60
                                ? "border-yellow-500/40 text-yellow-400 text-[10px]"
                                : "border-destructive/40 text-destructive text-[10px]"}
                            >
                              {emp.attendance_rate}%
                            </Badge>
                          </td>
                        </tr>
                      ))}
                      {monthly.by_employee.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-muted-foreground">No data for this month</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
