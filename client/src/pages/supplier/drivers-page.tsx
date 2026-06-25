import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Truck, Star } from "lucide-react";

const fakeDrivers = [
  { id: 1, name: "Karim Bousselmi", phone: "+216 55 123 001", zone: "Tunis Centre", deliveries: 47, rating: 4.9, status: "Active", vehicle: "Moto" },
  { id: 2, name: "Yassine Tlili", phone: "+216 55 123 002", zone: "Ariana", deliveries: 31, rating: 4.7, status: "Active", vehicle: "Van" },
  { id: 3, name: "Sami Gharbi", phone: "+216 55 123 003", zone: "La Marsa", deliveries: 22, rating: 4.5, status: "On Leave", vehicle: "Moto" },
  { id: 4, name: "Fatma Jedidi", phone: "+216 55 123 004", zone: "Sfax", deliveries: 19, rating: 4.8, status: "Active", vehicle: "Car" },
  { id: 5, name: "Nour Ben Ali", phone: "+216 55 123 005", zone: "Sousse", deliveries: 8, rating: 4.3, status: "Inactive", vehicle: "Van" },
];

const statusStyle: Record<string, string> = {
  Active: "bg-green-100 text-green-700",
  "On Leave": "bg-amber-100 text-amber-700",
  Inactive: "bg-gray-100 text-gray-600",
};

export default function DriversPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Drivers</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage your delivery drivers.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-green-500/10 rounded-xl p-3"><Truck className="w-5 h-5 text-green-600" /></div>
            <div><p className="text-xs text-muted-foreground">Active Drivers</p><p className="text-2xl font-bold">3</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-primary/10 rounded-xl p-3"><Truck className="w-5 h-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground">Total Drivers</p><p className="text-2xl font-bold">{fakeDrivers.length}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-amber-500/10 rounded-xl p-3"><Star className="w-5 h-5 text-amber-500" /></div>
            <div><p className="text-xs text-muted-foreground">Avg. Rating</p><p className="text-2xl font-bold">4.6</p></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base font-semibold">Driver List</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Driver</TableHead>
                <TableHead>Zone</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Deliveries</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fakeDrivers.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar className="w-8 h-8">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">{d.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">{d.name}</p>
                        <p className="text-xs text-muted-foreground">{d.phone}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{d.zone}</TableCell>
                  <TableCell className="text-muted-foreground">{d.vehicle}</TableCell>
                  <TableCell>{d.deliveries}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1"><Star className="w-3 h-3 fill-amber-400 text-amber-400" />{d.rating}</span>
                  </TableCell>
                  <TableCell><Badge variant="secondary" className={statusStyle[d.status]}>{d.status}</Badge></TableCell>
                  <TableCell><Button size="sm" variant="outline" className="h-7 text-xs">Assign</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
