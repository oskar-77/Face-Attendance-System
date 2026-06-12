import { useState } from "react";
import { Link } from "wouter";
import {
  useListEmployees, getListEmployeesQueryKey,
  useDeleteEmployee, useListDepartments, getListDepartmentsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Search, Trash2, Eye, Brain, Shield } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";

export default function Employees() {
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const params = {
    ...(search ? { search } : {}),
    ...(department !== "all" ? { department } : {}),
  };

  const { data: employees, isLoading } = useListEmployees(params, {
    query: { queryKey: getListEmployeesQueryKey(params) }
  });

  const { data: departments } = useListDepartments({
    query: { queryKey: getListDepartmentsQueryKey() }
  });

  const deleteMutation = useDeleteEmployee();

  const handleDelete = (id: number, name: string) => {
    deleteMutation.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
        toast({ title: "Employee removed", description: `${name} has been deleted.` });
      },
      onError: () => toast({ title: "Error", description: "Failed to delete employee.", variant: "destructive" })
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Employees</h2>
          <p className="text-muted-foreground mt-1">Manage workforce and face recognition models</p>
        </div>
        <Link href="/employees/new">
          <Button className="gap-2" data-testid="button-add-employee">
            <UserPlus className="w-4 h-4" />
            Add Employee
          </Button>
        </Link>
      </div>

      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or ID..."
            className="pl-9 bg-card/50"
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="input-search-employees"
          />
        </div>
        <Select value={department} onValueChange={setDepartment}>
          <SelectTrigger className="w-48 bg-card/50" data-testid="select-department-filter">
            <SelectValue placeholder="All Departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments?.map(d => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="bg-card/50 border-border/50">
              <CardContent className="p-5">
                <Skeleton className="h-4 w-32 mb-2" />
                <Skeleton className="h-3 w-24 mb-4" />
                <Skeleton className="h-8 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : employees && employees.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {employees.map(emp => (
            <Card
              key={emp.id}
              className="bg-card/50 border-border/50 hover:border-primary/30 transition-colors group"
              data-testid={`card-employee-${emp.id}`}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm ring-1 ring-primary/20">
                      {emp.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-foreground">{emp.name}</p>
                      <p className="text-xs text-muted-foreground">{emp.employee_number}</p>
                    </div>
                  </div>
                  <Badge
                    variant={emp.is_trained ? "default" : "secondary"}
                    className={emp.is_trained ? "bg-green-500/20 text-green-400 border-green-500/30 text-[10px]" : "text-[10px]"}
                  >
                    {emp.is_trained ? (
                      <><Brain className="w-2.5 h-2.5 mr-1" />Trained</>
                    ) : (
                      <><Shield className="w-2.5 h-2.5 mr-1" />Untrained</>
                    )}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground space-y-1 mb-4">
                  <p><span className="text-foreground/60">Dept:</span> {emp.department}</p>
                  <p><span className="text-foreground/60">Role:</span> {emp.position}</p>
                  <p><span className="text-foreground/60">Photos:</span> {emp.photo_count ?? 0}</p>
                </div>
                <div className="flex gap-2">
                  <Link href={`/employees/${emp.id}`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full gap-1.5 border-border/50 text-xs">
                      <Eye className="w-3 h-3" />
                      Manage
                    </Button>
                  </Link>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-destructive/70 hover:text-destructive hover:bg-destructive/10 px-2">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove Employee</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete {emp.name} and all their face data. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => handleDelete(emp.id, emp.name)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="bg-card/50 border-border/50 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mb-4">
              <UserPlus className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No employees found</h3>
            <p className="text-muted-foreground text-sm mb-6">Add your first employee to start tracking attendance</p>
            <Link href="/employees/new">
              <Button className="gap-2">
                <UserPlus className="w-4 h-4" />
                Add Employee
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
