import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Settings, Layout, Palette, Save, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface DashboardConfig {
  id: number;
  name: string;
  userId: string;
  widgets: any;
  layout: any;
  preferences: any;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function CustomDashboard() {
  const [selectedConfig, setSelectedConfig] = useState<DashboardConfig | null>(null);
  const [configName, setConfigName] = useState('');
  const [userId] = useState('default'); // For demo purposes
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch dashboard configurations
  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['/api/dashboards', { userId }],
    queryFn: async () => {
      const response = await fetch(`/api/dashboards?userId=${userId}`);
      return response.json();
    }
  });

  // Fetch default configuration
  const { data: defaultConfig } = useQuery({
    queryKey: ['/api/dashboards/default', { userId }],
    queryFn: async () => {
      const response = await fetch(`/api/dashboards/default?userId=${userId}`);
      return response.json();
    }
  });

  // Create new dashboard configuration
  const createConfigMutation = useMutation({
    mutationFn: async (config: any) => {
      const response = await apiRequest('POST', '/api/dashboards', config);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/dashboards'] });
      toast({ title: '成功', description: '仪表板配置已创建' });
      setConfigName('');
    },
    onError: () => {
      toast({ title: '错误', description: '创建仪表板配置失败', variant: 'destructive' });
    }
  });

  // Update dashboard configuration
  const updateConfigMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: any }) => {
      const response = await apiRequest('PUT', `/api/dashboards/${id}`, updates);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/dashboards'] });
      toast({ title: '成功', description: '仪表板配置已更新' });
    },
    onError: () => {
      toast({ title: '错误', description: '更新仪表板配置失败', variant: 'destructive' });
    }
  });

  // Delete dashboard configuration
  const deleteConfigMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest('DELETE', `/api/dashboards/${id}`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/dashboards'] });
      toast({ title: '成功', description: '仪表板配置已删除' });
      setSelectedConfig(null);
    },
    onError: () => {
      toast({ title: '错误', description: '删除仪表板配置失败', variant: 'destructive' });
    }
  });

  // Clone dashboard configuration
  const cloneConfigMutation = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const response = await apiRequest('POST', `/api/dashboards/${id}/clone`, { name, userId });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/dashboards'] });
      toast({ title: '成功', description: '仪表板配置已克隆' });
    },
    onError: () => {
      toast({ title: '错误', description: '克隆仪表板配置失败', variant: 'destructive' });
    }
  });

  useEffect(() => {
    if (defaultConfig && !selectedConfig) {
      setSelectedConfig(defaultConfig);
    }
  }, [defaultConfig]);

  const handleCreateConfig = () => {
    if (!configName.trim()) {
      toast({ title: '错误', description: '请输入配置名称', variant: 'destructive' });
      return;
    }

    const newConfig = {
      name: configName,
      userId,
      widgets: {
        marketOverview: { enabled: true, position: { x: 0, y: 0, w: 6, h: 4 } },
        priceChart: { enabled: true, position: { x: 6, y: 0, w: 6, h: 4 } },
        topGainers: { enabled: true, position: { x: 0, y: 4, w: 4, h: 3 } },
        topLosers: { enabled: true, position: { x: 4, y: 4, w: 4, h: 3 } },
        news: { enabled: true, position: { x: 8, y: 4, w: 4, h: 3 } }
      },
      layout: {
        cols: 12,
        rowHeight: 60,
        margin: [10, 10],
        containerPadding: [10, 10]
      },
      preferences: {
        theme: 'dark',
        autoRefresh: true,
        refreshInterval: 30,
        showWelcomeMessage: true,
        defaultCurrency: 'USD'
      },
      isDefault: false
    };

    createConfigMutation.mutate(newConfig);
  };

  const handleUpdatePreference = (key: string, value: any) => {
    if (!selectedConfig) return;

    const updatedPreferences = { ...selectedConfig.preferences, [key]: value };
    const updates = { preferences: updatedPreferences };

    updateConfigMutation.mutate({
      id: selectedConfig.id,
      updates
    });

    setSelectedConfig({
      ...selectedConfig,
      preferences: updatedPreferences
    });
  };

  const handleCloneConfig = (config: DashboardConfig) => {
    const cloneName = `${config.name} - Copy`;
    cloneConfigMutation.mutate({ id: config.id, name: cloneName });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64">加载中...</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">自定义仪表板</h1>
          <p className="text-muted-foreground">配置您的个性化数据面板</p>
        </div>
        <Badge variant="secondary" className="text-sm">
          {configs.length} 个配置
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configuration List */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layout className="h-5 w-5" />
              配置管理
            </CardTitle>
            <CardDescription>管理您的仪表板配置</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Create New Configuration */}
            <div className="space-y-2">
              <Label htmlFor="configName">新建配置</Label>
              <div className="flex gap-2">
                <Input
                  id="configName"
                  placeholder="输入配置名称"
                  value={configName}
                  onChange={(e) => setConfigName(e.target.value)}
                />
                <Button 
                  onClick={handleCreateConfig}
                  disabled={createConfigMutation.isPending}
                  size="sm"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Configuration List */}
            <div className="space-y-2">
              <Label>现有配置</Label>
              <div className="space-y-2">
                {configs.map((config: DashboardConfig) => (
                  <div
                    key={config.id}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedConfig?.id === config.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                    onClick={() => setSelectedConfig(config)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{config.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {config.isDefault && <Badge variant="outline" className="text-xs">默认</Badge>}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCloneConfig(config);
                          }}
                          disabled={cloneConfigMutation.isPending}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                        {!config.isDefault && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteConfigMutation.mutate(config.id);
                            }}
                            disabled={deleteConfigMutation.isPending}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Configuration Details */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              配置详情
            </CardTitle>
            <CardDescription>
              {selectedConfig ? `编辑 "${selectedConfig.name}" 配置` : '选择一个配置进行编辑'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedConfig ? (
              <Tabs defaultValue="preferences" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="preferences">偏好设置</TabsTrigger>
                  <TabsTrigger value="widgets">组件配置</TabsTrigger>
                  <TabsTrigger value="layout">布局设置</TabsTrigger>
                </TabsList>

                <TabsContent value="preferences" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>主题</Label>
                      <Select
                        value={selectedConfig.preferences?.theme || 'dark'}
                        onValueChange={(value) => handleUpdatePreference('theme', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="light">浅色</SelectItem>
                          <SelectItem value="dark">深色</SelectItem>
                          <SelectItem value="system">跟随系统</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>默认货币</Label>
                      <Select
                        value={selectedConfig.preferences?.defaultCurrency || 'USD'}
                        onValueChange={(value) => handleUpdatePreference('defaultCurrency', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="EUR">EUR</SelectItem>
                          <SelectItem value="CNY">CNY</SelectItem>
                          <SelectItem value="JPY">JPY</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>刷新间隔（秒）</Label>
                      <Input
                        type="number"
                        value={selectedConfig.preferences?.refreshInterval || 30}
                        onChange={(e) => handleUpdatePreference('refreshInterval', parseInt(e.target.value))}
                        min="10"
                        max="300"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        自动刷新
                        <Switch
                          checked={selectedConfig.preferences?.autoRefresh || false}
                          onCheckedChange={(checked) => handleUpdatePreference('autoRefresh', checked)}
                        />
                      </Label>
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        显示欢迎消息
                        <Switch
                          checked={selectedConfig.preferences?.showWelcomeMessage || false}
                          onCheckedChange={(checked) => handleUpdatePreference('showWelcomeMessage', checked)}
                        />
                      </Label>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="widgets" className="space-y-4">
                  <div className="grid grid-cols-1 gap-4">
                    {selectedConfig.widgets && Object.entries(selectedConfig.widgets).map(([key, widget]: [string, any]) => (
                      <div key={key} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <div className="font-medium capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</div>
                          <div className="text-sm text-muted-foreground">
                            位置: ({widget.position?.x}, {widget.position?.y}) 
                            大小: {widget.position?.w}x{widget.position?.h}
                          </div>
                        </div>
                        <Switch
                          checked={widget.enabled || false}
                          onCheckedChange={(checked) => {
                            const updatedWidgets = {
                              ...selectedConfig.widgets,
                              [key]: { ...widget, enabled: checked }
                            };
                            updateConfigMutation.mutate({
                              id: selectedConfig.id,
                              updates: { widgets: updatedWidgets }
                            });
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="layout" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>列数</Label>
                      <Input
                        type="number"
                        value={selectedConfig.layout?.cols || 12}
                        onChange={(e) => {
                          const updatedLayout = { ...selectedConfig.layout, cols: parseInt(e.target.value) };
                          updateConfigMutation.mutate({
                            id: selectedConfig.id,
                            updates: { layout: updatedLayout }
                          });
                        }}
                        min="1"
                        max="24"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>行高度</Label>
                      <Input
                        type="number"
                        value={selectedConfig.layout?.rowHeight || 60}
                        onChange={(e) => {
                          const updatedLayout = { ...selectedConfig.layout, rowHeight: parseInt(e.target.value) };
                          updateConfigMutation.mutate({
                            id: selectedConfig.id,
                            updates: { layout: updatedLayout }
                          });
                        }}
                        min="30"
                        max="200"
                      />
                    </div>
                  </div>

                  <div className="p-4 bg-muted rounded-lg">
                    <h4 className="font-medium mb-2">布局预览</h4>
                    <div className="text-sm text-muted-foreground">
                      网格: {selectedConfig.layout?.cols || 12} 列 × {selectedConfig.layout?.rowHeight || 60}px 行高
                      <br />
                      边距: [{selectedConfig.layout?.margin?.[0] || 10}, {selectedConfig.layout?.margin?.[1] || 10}]
                      <br />
                      容器内边距: [{selectedConfig.layout?.containerPadding?.[0] || 10}, {selectedConfig.layout?.containerPadding?.[1] || 10}]
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                从左侧选择一个配置开始编辑
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}