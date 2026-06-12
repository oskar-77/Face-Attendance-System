import { useGetAttendanceStats, getGetAttendanceStatsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserCheck, UserX, Clock } from "lucide-react";
import { format } from "date-fns";

export default function Dashboard() {
  const { data: stats, isLoading } = useGetAttendanceStats({
    query: {
      queryKey: getGetAttendanceStatsQueryKey()
    }
  });

  if (isLoading) {
    return <div>Loading dashboard...</div>;
  }

  if (!stats) return null;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Overview</h2>
          <p className="text-muted-foreground mt-1">Real-time attendance metrics for {format(new Date(), 'MMMM d, yyyy')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Workforce</CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.total_employees}</div>
            <p className="text-xs text-muted-foreground mt-1">{stats.trained_employees} face models trained</p>
          </CardContent>
        </Card>
        
        <Card className="bg-card/50 backdrop-blur border-border/50 border-l-4 border-l-primary/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Present Today</CardTitle>
            <UserCheck className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{stats.present_today}</div>
            <p className="text-xs text-muted-foreground mt-1">Checked in</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Absent</CardTitle>
            <UserX className="w-4 h-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.absent_today}</div>
            <p className="text-xs text-muted-foreground mt-1">Not checked in</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Work Hours</CardTitle>
            <Clock className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.avg_work_hours.toFixed(1)}h</div>
            <p className="text-xs text-muted-foreground mt-1">Current month</p>
          </CardContent>
        </Card>
      </div>

      <h3 className="text-xl font-bold tracking-tight mt-8 mb-4">Recent Activity</h3>
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <div className="p-0">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-3 font-medium text-muted-foreground">Employee</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Department</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Check In</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Check Out</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {stats.recent_activity?.map((record) => (
                <tr key={record.id} className="hover:bg-muted/20">
                  <td className="px-6 py-4">
                    <div className="font-medium text-foreground">{record.employee_name}</div>
                    <div className="text-xs text-muted-foreground">{record.employee_number}</div>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">{record.department}</td>
                  <td className="px-6 py-4">
                    <div className="inline-flex items-center px-2 py-1 rounded-md bg-primary/10 text-primary text-xs font-medium">
                      {format(new Date(record.check_in), 'HH:mm:ss')}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {record.check_out ? (
                      <div className="inline-flex items-center px-2 py-1 rounded-md bg-muted text-muted-foreground text-xs font-medium">
                        {format(new Date(record.check_out), 'HH:mm:ss')}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs italic">Active</span>
                    )}
                  </td>
                </tr>
              ))}
              {(!stats.recent_activity || stats.recent_activity.length === 0) && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
                    No recent activity
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
