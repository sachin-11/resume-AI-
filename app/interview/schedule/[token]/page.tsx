"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Brain, Loader2, Calendar, Clock, CheckCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Slot {
  id: string;
  startsAt: string;
  durationMin: number;
  isBooked: boolean;
}

function groupByDate(slots: Slot[]): Record<string, Slot[]> {
  return slots.reduce((acc, slot) => {
    const date = new Date(slot.startsAt).toLocaleDateString("en-IN", {
      weekday: "long", month: "long", day: "numeric",
    });
    if (!acc[date]) acc[date] = [];
    acc[date].push(slot);
    return acc;
  }, {} as Record<string, Slot[]>);
}

export default function SchedulePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();

  const [slots, setSlots] = useState<Slot[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState(false);
  const [bookedSlot, setBookedSlot] = useState<Slot | null>(null);
  const [error, setError] = useState("");
  const [currentDateIdx, setCurrentDateIdx] = useState(0);

  useEffect(() => {
    // Load invite info + available slots
    fetch(`/api/interview/invite/${token}`)
      .then((r) => r.json())
      .then(async (d) => {
        if (d.error) { setError(d.error); setLoading(false); return; }
        setCandidateName(d.invite?.name ?? "");
        setRole(d.campaign?.role ?? "");
        setCampaignId(d.campaign?.id ?? "");

        // Check if already scheduled
        if (d.invite?.scheduledAt) {
          setBooked(true);
          setBookedSlot({ id: "", startsAt: d.invite.scheduledAt, durationMin: 30, isBooked: true });
          setLoading(false);
          return;
        }

        // Fetch available slots
        const sRes = await fetch(`/api/campaigns/${d.campaign?.id}/slots`);
        const sData = await sRes.json();
        setSlots(sData.slots ?? []);
        setLoading(false);
      })
      .catch(() => { setError("Failed to load"); setLoading(false); });
  }, [token]);

  async function handleBook() {
    if (!selectedSlot) return;
    setBooking(true); setError("");
    const res = await fetch("/api/interview/public/book-slot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, slotId: selectedSlot.id }),
    });
    const data = await res.json();
    if (res.ok) {
      setBooked(true);
      setBookedSlot(selectedSlot);
    } else {
      setError(data.error ?? "Booking failed");
    }
    setBooking(false);
  }

  const grouped = groupByDate(slots);
  const dateKeys = Object.keys(grouped);
  const currentDate = dateKeys[currentDateIdx];
  const currentSlots = currentDate ? grouped[currentDate] : [];

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600">
            <Brain className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="font-bold">AI Resume Coach</p>
            <p className="text-xs text-muted-foreground">Interview Scheduling</p>
          </div>
        </div>

        {/* Booked confirmation */}
        {booked && bookedSlot && (
          <Card className="border-green-500/30">
            <CardContent className="p-6 text-center space-y-4">
              <CheckCircle className="h-12 w-12 text-green-400 mx-auto" />
              <div>
                <h2 className="text-lg font-bold text-green-400">Interview Scheduled!</h2>
                <p className="text-muted-foreground text-sm mt-1">
                  Your interview for <strong>{role}</strong> is confirmed.
                </p>
              </div>
              <div className="rounded-lg bg-green-500/10 border border-green-500/20 px-4 py-3">
                <p className="text-sm font-semibold">
                  {new Date(bookedSlot.startsAt).toLocaleString("en-IN", {
                    weekday: "long", month: "long", day: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Duration: {bookedSlot.durationMin} minutes</p>
              </div>
              <p className="text-xs text-muted-foreground">
                A confirmation email has been sent. You can start your interview at the scheduled time.
              </p>
              <Button className="w-full" onClick={() => router.push(`/interview/invite/${token}`)}>
                Go to Interview →
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Slot picker */}
        {!booked && (
          <Card>
            <CardContent className="p-6 space-y-5">
              <div>
                <h2 className="text-lg font-bold">Choose Your Interview Slot</h2>
                <p className="text-muted-foreground text-sm mt-1">
                  Hello{candidateName ? ` ${candidateName}` : ""}! Pick a time that works for you.
                </p>
                {role && (
                  <p className="text-xs text-violet-400 mt-1">Position: {role}</p>
                )}
              </div>

              {error && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
              )}

              {slots.length === 0 ? (
                <div className="text-center py-8">
                  <Calendar className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">No slots available yet.</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">The recruiter hasn&apos;t added any slots. You can start the interview anytime using your invite link.</p>
                  <Button className="mt-4" onClick={() => router.push(`/interview/invite/${token}`)}>
                    Start Interview Now →
                  </Button>
                </div>
              ) : (
                <>
                  {/* Date navigation */}
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setCurrentDateIdx((p) => Math.max(0, p - 1))}
                      disabled={currentDateIdx === 0}
                      className="p-1.5 rounded-lg border border-border hover:bg-accent disabled:opacity-30 transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <div className="text-center">
                      <p className="text-sm font-semibold">{currentDate}</p>
                      <p className="text-xs text-muted-foreground">{currentDateIdx + 1} of {dateKeys.length} days</p>
                    </div>
                    <button
                      onClick={() => setCurrentDateIdx((p) => Math.min(dateKeys.length - 1, p + 1))}
                      disabled={currentDateIdx === dateKeys.length - 1}
                      className="p-1.5 rounded-lg border border-border hover:bg-accent disabled:opacity-30 transition-colors"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Time slots grid */}
                  <div className="grid grid-cols-3 gap-2">
                    {currentSlots.map((slot) => {
                      const time = new Date(slot.startsAt).toLocaleTimeString("en-IN", {
                        hour: "2-digit", minute: "2-digit", hour12: true,
                      });
                      const isSelected = selectedSlot?.id === slot.id;
                      return (
                        <button
                          key={slot.id}
                          onClick={() => setSelectedSlot(slot)}
                          className={`flex flex-col items-center justify-center rounded-xl border p-3 transition-all ${
                            isSelected
                              ? "border-violet-500 bg-violet-500/10 text-violet-400"
                              : "border-border hover:bg-accent hover:border-violet-500/40"
                          }`}
                        >
                          <Clock className={`h-4 w-4 mb-1 ${isSelected ? "text-violet-400" : "text-muted-foreground"}`} />
                          <span className="text-sm font-semibold">{time}</span>
                          <span className="text-[10px] text-muted-foreground">{slot.durationMin} min</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Selected slot summary */}
                  {selectedSlot && (
                    <div className="rounded-lg bg-violet-500/10 border border-violet-500/20 px-4 py-3">
                      <p className="text-sm font-medium text-violet-400">Selected:</p>
                      <p className="text-sm mt-0.5">
                        {new Date(selectedSlot.startsAt).toLocaleString("en-IN", {
                          weekday: "short", month: "short", day: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })} · {selectedSlot.durationMin} min
                      </p>
                    </div>
                  )}

                  <Button
                    className="w-full"
                    onClick={handleBook}
                    disabled={!selectedSlot || booking}
                  >
                    {booking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
                    {booking ? "Booking…" : "Confirm Slot"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
