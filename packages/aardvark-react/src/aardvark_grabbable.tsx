import { AvConstraint, AvGrabEvent, AvGrabEventType, AvNodeTransform, AvNodeType, EndpointAddr, ENodeFlags } from '@aardvarkxr/aardvark-shared';
import bind from 'bind-decorator';
import { AvBaseNode, AvBaseNodeProps } from './aardvark_base_node';
import { AvGadget } from './aardvark_gadget';

export interface GrabResponse
{
	allowed: boolean;
	proxyGrabbableGlobalId?: EndpointAddr;
	proxyHandleGlobalId?: EndpointAddr;
}

/** This enum defines the possible highlight states of an AvGrabbable. 
*/
export enum HighlightType
{
	/** Nothing interesting is going on with the grabbable. */
	None = 0,

	/** There is a grabber within grabbing range of the grabbable. */
	InRange = 1,

	/** There is a grabber actively grabbing the grabbable, and it isn't attached to anything. */
	Grabbed = 2,

	/** The grabbed grabbable is within drop range of a hook. */
	InHookRange = 3,
}


/** Options for how to interact with hooks. */
export enum HookInteraction
{
	/** No interaction with hooks at all. */
	None = 0,

	/** Highlight the hook, but never drop on a hook. */
	HighlightOnly = 1,

	/** Highlight the hook and drop on it when appropriate. */
	HighlightAndDrop = 2,
}

export interface GrabbableInterfaceEventProcessor
{
	( sender: EndpointAddr, data: object ): void;
}

interface AvGrabbableProps extends AvBaseNodeProps
{
	/** This callback is called whenever the highlight state of the grabbable is updated. 
	 * Use this to change models, apply scale, animate, color tint, or however else you 
	 * want to indicate grabber proximity and grab state to the user. If this callback is
	 * not specified, the grabbable will not highlight.
	 * 
	 * @default no highlight
	 */
	updateHighlight?: ( highlightType: HighlightType, handleAddr: EndpointAddr, tethered: boolean,
		interfaceName: string, hookId: EndpointAddr ) => void;

	/** This callback allows the grabbable's owner to override the default behavior
	 * when the grabbable is grabbed. If this is not specified, the grabbable's transform
	 * will be updated to match the grabber whenever it is grabbed.
	 * 
	 * @default grabbing moves the grabbable
	 */
	onGrabRequest?: ( event: AvGrabEvent ) => Promise<GrabResponse>;

	/** This callback allows the grabbables owner to respond when the transform for the
	 * grabbable has been updated as the result of being grabbed.
	 * 
	 * * parentFromNode - The transform from the coordinate system of the grabbable itself to the 
	 * 		coordinate system of its parent in the scene graph.
	 * * universeFromNode - The transform from the coordinate system of the grabbable itself to
	 * 		the coordinate system of the "universe", which means the center of the user's play area.
	 */
	onTransformUpdated?: ( parentFromNode: AvNodeTransform, universeFromNode: AvNodeTransform ) => void;

	/** Defines the constraints to apply to the transform of the grabbable after it has been 
	 * grabbed.
	 * 
	 * @default No constraints
	 */
	constraint?: AvConstraint;

	/** If this prop is true, the grabbable will stay wherever it was dropped at the end of a 
	 * grab. If preserveDropTransform is false for the root grabbable of a gadget, that gadget
	 * will not be able to be dropped in the world, and will be destroyed when dropped anywhere
	 * other than a hook
	 * 
	 * @default false
	 */
	preserveDropTransform?: boolean;

	/** The initial transform of the grabbable before it has been grabbed. 
	 * 
	 * @default identity transform
	 */
	initialTransform?: AvNodeTransform;

	/** Controls how this grabbable interacts wtih hooks
	 * 
	 * @default HighlightAndDrop
	 */
	hookInteraction?: HookInteraction;

	/** If this is true, the grabbable will always be grabbed with an identity transform
	 * instead of preserving the transform between the grabbable and the grabber at the
	 * start of the grab.
	 * 
	 * @default false
	 */
	grabWithIdentityTransform?: boolean;

	/** Show the grab indicator when this grabbable is grabbed.
	 * 
	 * @default true
	 */
	showGrabIndicator?: boolean;

	/** The list of interfaces that this grabbable implements. These can be any string of the form
	 * <interfacename>@<version>. When selecting an interface for a grabbable that is in range 
	 * of a hook Aardvark will select the first matching interface in the list, so the grabbable
	 * should order its interfaces from highest to lowest priority if multiple interfaces of the 
	 * same type are available.
	 * 
	 * @default { "aardvark-gadget@1": null }
	 */
	interfaces?: { [interfaceName: string] : GrabbableInterfaceEventProcessor };
}

interface AvGrabbableState
{
	/** If this grabbable is tethered to a hook, this will be the EPA of the hook. */
	hook?: EndpointAddr;

	/** If this grabbable is tethered to a hook, this will be the transform from
	 * the grabbable to the hook.
	 */
	hookFromGrabbable?: AvNodeTransform;

	/** The last highlight that we told anyone. */
	lastHighlight: HighlightType;

	/** The last handle that we told anyone */
	lastHandle: EndpointAddr;

	/** the last interface name we were told */
	lastInterfaceName: string;

	/** the last nearby hook */
	nearbyHook?: EndpointAddr;
}


/** This is a node that can be grabbed. Depending on how it is configured, the node
 * may be reparented to the grabber, or it may just call back the owner with its 
 * updated grab state.
 */
export class AvGrabbable extends AvBaseNode< AvGrabbableProps, AvGrabbableState >
{
	/** The last highlight that we told anyone. */
	private m_lastNotifiedHighlight: HighlightType = HighlightType.None;
	private m_lastNotifiedHandle: EndpointAddr = null;
	private m_lastNotifiedTethered: boolean = false;
	private m_lastNotifiedInterfaceName: string = null;
	private m_lastNotifiedHook: EndpointAddr = null;

	constructor( props: any )
	{
		super( props );

		this.state = 
		{ 
			lastHighlight: HighlightType.None,
			lastHandle: null,
			lastInterfaceName: null,
		};
	}

	public buildNode()
	{
		AvGadget.instance().setGrabEventProcessor( this.m_nodeId, this.onGrabEvent );
		let node = this.createNodeObject( AvNodeType.Grabbable, this.m_nodeId );
		if( this.props.constraint )
		{
			node.propConstraint = this.props.constraint;
		}
		if( this.props.initialTransform )
		{
			node.propTransform = this.props.initialTransform;
		}
		if( this.props.onTransformUpdated )
		{
			node.flags |= ENodeFlags.NotifyOnTransformChange;
		}
		if( this.props.preserveDropTransform )
		{
			node.flags |= ENodeFlags.PreserveGrabTransform;
		}
		switch( this.props.hookInteraction ?? HookInteraction.None )
		{
			case HookInteraction.None:
				// no flags
				break;

			case HookInteraction.HighlightOnly:
				if( !this.state.hook )
				{
					node.flags |= ENodeFlags.HighlightHooks;
				}
				break;

			case HookInteraction.HighlightAndDrop:
				if( !this.state.hook )
				{
					node.flags |= ENodeFlags.HighlightHooks | ENodeFlags.AllowDropOnHooks;
				}
				break;
		}
		if( this.state.hook )
		{
			node.flags |= ENodeFlags.Tethered;
		}
		if( typeof this.props.showGrabIndicator !== "boolean" || this.props.showGrabIndicator )
		{
			node.flags |= ENodeFlags.ShowGrabIndicator;
		}

		if( this.props.interfaces )
		{
			let interfaces: string[] = [];
			let needProcessor = false;
			for( let interfaceName in this.props.interfaces )
			{
				interfaces.push( interfaceName );
				needProcessor = needProcessor || ( this.props.interfaces[ interfaceName ] != null )
			}
			node.propInterfaces = interfaces;

			if( needProcessor )
			{
				AvGadget.instance().setInterfaceEventProcessor( this.m_nodeId, this.onInterfaceEvent );
			}
		}
		else
		{
			node.propInterfaces = [ "aardvark-gadget@1" ];
		}


		return node;
	}

	public grabInProgress( grabber: EndpointAddr ):void
	{
		//console.log( `Starting out grabbed by ${ endpointAddrToString( grabber) }` );
		this.setState( { lastHighlight: HighlightType.Grabbed } );
	}

	public componentDidUpdate()
	{
		if( this.props.updateHighlight )
		{
			if( this.state.lastHighlight != this.m_lastNotifiedHighlight
				|| this.state.lastHandle != this.m_lastNotifiedHandle 
				|| !!this.state.hook != this.m_lastNotifiedTethered 
				|| this.state.lastInterfaceName != this.m_lastNotifiedInterfaceName
				|| this.state.nearbyHook != this.m_lastNotifiedHook )
			{
				//console.log( "updating highlight", this.state );
				this.m_lastNotifiedHighlight = this.state.lastHighlight;
				this.m_lastNotifiedHandle = this.state.lastHandle;
				this.m_lastNotifiedTethered = !!this.state.hook;
				this.m_lastNotifiedInterfaceName = this.state.lastInterfaceName;
				this.m_lastNotifiedHook = this.state.nearbyHook;
				this.props.updateHighlight( this.state.lastHighlight, this.state.lastHandle, !!this.state.hook,
					this.state.lastInterfaceName, this.state.nearbyHook );
			}
		}
	}

	@bind private onGrabEvent( evt: AvGrabEvent )
	{
//		console.log( `Grab event ${ AvGrabEventType[ evt.type ] }` );
		switch( evt.type )
		{
			case AvGrabEventType.EnterRange:
				this.setState( { lastHighlight: HighlightType.InRange, lastHandle: evt.handleId } );
				break;

			case AvGrabEventType.LeaveRange:
				this.setState( { lastHighlight: HighlightType.None, lastHandle: null } );
				break;

			case AvGrabEventType.StartGrab:
				this.setState( { lastHighlight: HighlightType.Grabbed, lastHandle: null } );
				break;

			case AvGrabEventType.EndGrab:
				this.setState( 
					{ 
						lastHighlight: HighlightType.InRange, 
						lastHandle: evt.handleId,
						hook: evt.hookId,
						hookFromGrabbable: evt.hookFromGrabbable,
					} );
				break;

			case AvGrabEventType.Detach:
				this.setState( { lastHighlight: HighlightType.Grabbed, lastHandle: evt.handleId, 
					hook: null, hookFromGrabbable: null } );
				break;

			case AvGrabEventType.EnterHookRange:
				this.setState( 
					{ 
						lastHighlight: HighlightType.InHookRange, 
						lastHandle: evt.handleId,
						lastInterfaceName: evt.interface,
						nearbyHook: evt.hookId,
					} );
				break;

			case AvGrabEventType.LeaveHookRange:
				this.setState( 
					{ 
						lastHighlight: HighlightType.Grabbed, 
						lastHandle: evt.handleId,
						lastInterfaceName: null,
						nearbyHook: null,
					} );
				break;

			case AvGrabEventType.RequestGrab:
				if( !this.props.onGrabRequest )
				{
					// The grabber is asking us for permission. If our owner has
					// no opinion, just say yes.
					AvGadget.instance().sendGrabEvent(
						{
							type: AvGrabEventType.RequestGrabResponse,
							senderId: this.m_nodeId,
							grabbableId: evt.grabbableId,
							handleId: evt.handleId,
							grabberId: evt.grabberId,
							requestId: evt.requestId,
							useIdentityTransform: this.props.grabWithIdentityTransform,
							allowed: true,
						});
				}
				else
				{
					this.props.onGrabRequest( evt )
					.then( ( response: GrabResponse ) =>
					{
						let grabbableId: EndpointAddr;
						let handleId: EndpointAddr;
						if( response.proxyGrabbableGlobalId )
						{
							grabbableId = response.proxyGrabbableGlobalId;
							handleId = response.proxyHandleGlobalId;
						}
						else
						{
							grabbableId = evt.grabbableId;
							handleId = evt.handleId;
						}

						AvGadget.instance().sendGrabEvent(
							{
								type: AvGrabEventType.RequestGrabResponse,
								senderId: this.m_nodeId,
								grabbableId: grabbableId,
								handleId: handleId,
								grabberId: evt.grabberId,
								requestId: evt.requestId,
								allowed: response.allowed,
							});
					})
					.catch( ( reason: any ) =>
					{
						console.log( "Promise from onGrabRequest was unfulfilled", reason );
						AvGadget.instance().sendGrabEvent(
							{
								type: AvGrabEventType.RequestGrabResponse,
								senderId: this.m_nodeId,
								grabbableId: evt.grabbableId,
								handleId: evt.handleId,
								grabberId: evt.grabberId,
								requestId: evt.requestId,
								allowed: false,
							});
					});
				}
				break;

			case AvGrabEventType.TransformUpdated:
				if( this.props.onTransformUpdated )
				{
					this.props.onTransformUpdated( evt.parentFromNode, evt.universeFromNode );
				}
		}
	}

	@bind
	private onInterfaceEvent( interfaceName: string, sender: EndpointAddr, data: object )
	{
		let processor = this.props.interfaces?.[ interfaceName ];
		if( processor )
		{
			processor( sender, data );
		}
	}
}
