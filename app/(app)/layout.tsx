import MainSidebar from '@/components/MainSidebar'
import {SidebarProvider} from '@/components/ui/sidebar'

const AppLayout = ({
	children
}: {
  children: React.ReactNode
}) => {
	return (
		<SidebarProvider>
			<MainSidebar />
			<main className="bg-sidebar w-full p-1.5">
				<div className="h-full w-full bg-background rounded-lg p-4 overflow-y-auto">
					{children}
				</div>
			</main>
		</SidebarProvider>
	)
}

export default AppLayout
