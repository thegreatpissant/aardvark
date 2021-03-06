import * as React from 'react';
import { AvTransform } from './aardvark_transform';
import bind from 'bind-decorator';
import { AvModel } from './aardvark_model';
import { EndpointAddr } from '@aardvarkxr/aardvark-shared';
import { HighlightType, AvGrabbable, HookInteraction } from './aardvark_grabbable';
import { AvModelBoxHandle } from './aardvark_handles';

export enum ShowGrabbableChildren
{
	/** Always show the children of the AvStandardGrabbable, no matter
	 * what the highlight state is.
	 */
	Always = 0,

	/** Only show the children of the AvStandardGrabbable when it is 
	 * being grabbed.
	 */
	OnlyWhenGrabbed = 1,

	/** Only show the children of the AvStandardGrabbable when it is 
	 * not being grabbed.
	 */
	OnlyWhenNotGrabbed = 2,
}

export enum DropStyle
{
	/** Drop this grabbable on hooks */
	DropOnHooks = 1,

	/** Drop this grabbable in the world */
	DropInTheWorld = 2,
}

interface StandardGrabbableProps
{
	/** The model to use for the grab handle of this grabbable. */
	modelUri: string;

	/** Causes the grabbable to always use an identity transform when it is 
	 * grabbed.
	 * 
	 * @default false
	 */
	grabWithIdentityTransform?: boolean;

	/** Tells the standard grabbable when to show its children. 
	 * 
	 * @default ShowGrabbableChildren.Always
	*/
	showChildren?: ShowGrabbableChildren;

	/** Uniform scale to apply to the grab handle.
	 * 
	 * @default 1.0
	*/
	modelScale?: number;

	/** Color to apply to the grab handle.
	 * 
	 * @default none
	*/
	modelColor?: string;

	/** Called when the grabbable is grabbed. 
	 * 
	 * @default none
	*/
	onGrab?: () => void;

	/** Called when the grabbable is dropped. 
	 * 
	 * @default none
	*/
	onEndGrab?: () => void;

	/** Controls where this grabbable can be dropped.
	 * 
	 * @default DropOnHooks
	 */
	dropStyle?: DropStyle;
}


interface StandardGrabbableState
{
	highlight: HighlightType;
}

/** A grabbable that shows a model for its handle and highlights automatically. */
export class AvStandardGrabbable extends React.Component< StandardGrabbableProps, StandardGrabbableState >
{
	constructor( props: any )
	{
		super( props );

		this.state = 
		{ 
			highlight: HighlightType.None
		};
	}

	@bind onUpdateHighlight( highlight: HighlightType, handleAddr: EndpointAddr, tethered: boolean )
	{
		this.setState( ( oldState: StandardGrabbableState ) =>
		{
			if( oldState.highlight == HighlightType.InRange || oldState.highlight == HighlightType.None )
			{
				if( highlight == HighlightType.Grabbed )
				{
					console.log( "standard grabbable was grabbed" );
					this.props.onGrab?.();
				}
			}
			else if( oldState.highlight == HighlightType.Grabbed )
			{
				if( highlight == HighlightType.InRange || highlight == HighlightType.None )
				{
					console.log( "standard grabbable was ungrabbed" );
					this.props.onEndGrab?.();
				}
			}
			return { ...oldState, highlight };
		} );
	}

	public render()
	{
		let showChildren: boolean;
		switch( this.props.showChildren ?? ShowGrabbableChildren.Always )
		{
			default:
			case ShowGrabbableChildren.Always:
				showChildren = true;
				break;

			case ShowGrabbableChildren.OnlyWhenGrabbed:
				showChildren = this.state.highlight == HighlightType.Grabbed 
					|| this.state.highlight == HighlightType.InHookRange;
				break;

			case ShowGrabbableChildren.OnlyWhenNotGrabbed:
				showChildren = this.state.highlight == HighlightType.None 
					|| this.state.highlight == HighlightType.InRange;
				break;
		}

		let scale = this.state.highlight == HighlightType.InRange ? 1.1 : 1.0;
		if( this.props.modelScale )
		{
			scale *= this.props.modelScale;
		}

		let hookInteraction: HookInteraction;
		let preserveDropTransform: boolean;
		switch( this.props.dropStyle ?? DropStyle.DropOnHooks )
		{
			case DropStyle.DropOnHooks:
				hookInteraction = HookInteraction.HighlightAndDrop;
				preserveDropTransform = false;
				break;

			case DropStyle.DropInTheWorld:
				hookInteraction = HookInteraction.None;
				preserveDropTransform = true;
				break;
		}

		return (
			<AvGrabbable updateHighlight={ this.onUpdateHighlight } 
				preserveDropTransform={ preserveDropTransform }
				grabWithIdentityTransform={ this.props.grabWithIdentityTransform } 
				hookInteraction={ hookInteraction }>
				<AvTransform uniformScale={ scale }>
					<AvModel uri={ this.props.modelUri} color={ this.props.modelColor }/>
					<AvModelBoxHandle uri={ this.props.modelUri } />
				</AvTransform>

				{ showChildren && this.props.children }
			</AvGrabbable> );
	}
}


