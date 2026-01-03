import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { 
  useCallHistory, 
  useMissedCallCount, 
  useMarkCallsAsRead,
  CallHistoryItem,
  CallHistoryFilter 
} from '@/hooks/useCallHistory';
import { useInitiateCall, CallType } from '@/hooks/useCalls';
import { CallHistoryItemComponent } from '@/components/call/CallHistoryItem';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, Phone, PhoneMissed, PhoneIncoming, PhoneOutgoing } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const Calls = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<CallHistoryFilter>('all');
  const { data: calls = [], isLoading } = useCallHistory(filter);
  const { data: missedCount = 0 } = useMissedCallCount();
  const markAsRead = useMarkCallsAsRead();
  const initiateCall = useInitiateCall();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  // Mark calls as read when viewing history
  useEffect(() => {
    if (calls.length > 0 && missedCount > 0) {
      const unreadCallIds = calls.filter(c => !c.is_read && c.is_missed).map(c => c.id);
      if (unreadCallIds.length > 0) {
        markAsRead.mutate(unreadCallIds);
      }
    }
  }, [calls, missedCount]);

  const handleCallBack = async (call: CallHistoryItem) => {
    const recipientIds = call.participants
      .filter(p => p.user_id !== user?.id)
      .map(p => p.user_id);

    if (recipientIds.length === 0) {
      toast.error('No one to call');
      return;
    }

    try {
      await initiateCall.mutateAsync({
        chatId: call.chat_id,
        callType: call.call_type,
        recipientIds
      });
      toast.success('Call started');
      navigate('/');
    } catch (error: any) {
      toast.error(error.message || 'Failed to start call');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex h-screen-dynamic flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 border-b p-4 pt-safe">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/')}
          className="shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">Calls</h1>
      </div>

      {/* Filter Tabs */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as CallHistoryFilter)} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-4 rounded-none border-b bg-transparent p-0">
          <TabsTrigger 
            value="all" 
            className="relative rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
          >
            <Phone className="h-4 w-4 mr-1.5" />
            All
          </TabsTrigger>
          <TabsTrigger 
            value="missed"
            className="relative rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
          >
            <PhoneMissed className="h-4 w-4 mr-1.5" />
            Missed
            {missedCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
                {missedCount > 99 ? '99+' : missedCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger 
            value="incoming"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
          >
            <PhoneIncoming className="h-4 w-4 mr-1.5" />
            In
          </TabsTrigger>
          <TabsTrigger 
            value="outgoing"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
          >
            <PhoneOutgoing className="h-4 w-4 mr-1.5" />
            Out
          </TabsTrigger>
        </TabsList>

        <TabsContent value={filter} className="flex-1 mt-0">
          <ScrollArea className="h-full">
            {isLoading ? (
              <div className="flex items-center justify-center p-8">
                <div className="animate-pulse text-muted-foreground">Loading calls...</div>
              </div>
            ) : calls.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <Phone className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">
                  {filter === 'all' && 'No call history yet'}
                  {filter === 'missed' && 'No missed calls'}
                  {filter === 'incoming' && 'No incoming calls'}
                  {filter === 'outgoing' && 'No outgoing calls'}
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {calls.map((call) => (
                  <CallHistoryItemComponent
                    key={call.id}
                    call={call}
                    currentUserId={user.id}
                    onCallBack={() => handleCallBack(call)}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Calls;
